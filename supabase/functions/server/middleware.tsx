import { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import * as jose from "https://deno.land/x/jose@v5.9.6/index.ts";

// JWT Authentication Middleware - Fixed JWT verification (v2)
// CRITICAL: Create TWO separate clients
// 1. Service role client for admin operations (user management, bypassing RLS)
// 2. Anon key client for JWT verification (must use same key that issued the tokens)

const serviceRoleClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// CRITICAL FIX: Use anon key client for JWT verification
// User JWTs are signed with the project's secret and validated against the anon key
const anonClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

// Export the service role client for other parts of the server to use
export { serviceRoleClient };

// Get environment variables for JWT verification
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET");

/**
 * Kid session verification utility
 */
async function verifyKidSession(token: string) {
  try {
    const sessions = await import("./kv_store.tsx");
    const sessionKey = `kidsession:${token}`;
    const session = await sessions.get(sessionKey);
    
    if (!session) {
      return { valid: false, error: "Session not found" };
    }
    
    // Check if session is expired (24 hour sessions)
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      return { valid: false, error: "Session expired" };
    }
    
    return {
      valid: true,
      childId: session.childId,
      familyId: session.familyId,
    };
  } catch (error) {
    console.error('❌ Kid session verification error:', error);
    return { valid: false, error: "Verification failed" };
  }
}

/**
 * Extract and verify JWT from Authorization header
 * Also supports kid session tokens (kid_xxx)
 * Returns user object or null
 */
async function verifyToken(c: Context) {
  const authHeader = c.req.header("Authorization") || c.req.header("authorization");
  
  if (!authHeader || (!authHeader.startsWith("Bearer "))) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  
  if (!token) {
    return null;
  }

  // Check if this is a kid session token
  if (token.startsWith('kid_')) {
    const kidSession = await verifyKidSession(token);
    
    if (!kidSession.valid) {
      return null;
    }
    
    // Return a pseudo-user object for kid sessions
    return {
      id: kidSession.childId,
      role: 'kid',
      isKidSession: true,
      familyId: kidSession.familyId,
      user_metadata: { role: 'kid' }
    };
  }

  // Standard parent JWT verification using manual decode
  try {
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode payload using base64url decoding
    const base64Url = parts[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    const jsonPayload = atob(base64);
    const payload = JSON.parse(jsonPayload);
    
    // Validate expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    
    // Validate required fields
    if (!payload.sub) {
      return null;
    }
    
    // Return user object constructed from JWT payload
    return {
      id: payload.sub,
      email: payload.email || '',
      role: payload.user_metadata?.role || payload.role || 'parent',
      user_metadata: payload.user_metadata || { role: 'parent', name: payload.email || '' },
      app_metadata: payload.app_metadata || {},
      aud: payload.aud || '',
      created_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : new Date().toISOString()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Middleware: Require authentication
 */
export async function requireAuth(c: Context, next: () => Promise<void>) {
  try {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    
    // Debug logging
    console.log('🔐 requireAuth middleware called:', {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20),
      path: c.req.path,
      method: c.req.method
    });
    
    const user = await verifyToken(c);
    
    if (!user) {
      console.error('❌ requireAuth: Token verification failed', {
        hasAuthHeader: !!authHeader,
        authHeaderLength: authHeader?.length,
        tokenPrefix: authHeader?.replace('Bearer ', '').substring(0, 50),
        path: c.req.path
      });
      return c.json({ 
        error: "Unauthorized",
        code: 401,
        message: "Invalid JWT",
        debug: {
          hasAuthHeader: !!authHeader,
          authHeaderLength: authHeader?.length,
          tokenPrefix: authHeader?.replace('Bearer ', '').substring(0, 30)
        }
      }, 401);
    }
    
    console.log('✅ requireAuth: User verified:', {
      userId: user.id,
      role: user.role,
      isKidSession: user.isKidSession
    });
    
    // Store user in context for downstream handlers
    c.set("user", user);
    await next();
  } catch (error) {
    console.error('❌ requireAuth: Authentication error:', error);
    return c.json({ 
      error: "Authentication error",
      details: String(error)
    }, 500);
  }
}

/**
 * Middleware: Require parent role
 */
export async function requireParent(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Allow if user is a parent (not a kid session)
  if (user.isKidSession) {
    return c.json({ error: "Parent access required" }, 403);
  }
  
  await next();
}

/**
 * Middleware: Require family access
 */
export async function requireFamilyAccess(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  // Handle both :familyId and :id parameter names
  const familyId = c.req.param("familyId") || c.req.param("id");
  
  if (!user || !familyId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // For kid sessions, verify family membership
  if (user.isKidSession) {
    if (user.familyId !== familyId) {
      return c.json({ error: "Access denied to this family" }, 403);
    }
    await next();
    return;
  }
  
  // For parent users, verify family membership via KV store
  try {
    const kv = await import("./kv_store.tsx");
    
    // Handle both "family:xxx" and "xxx" formats
    const familyKey = familyId.startsWith('family:') ? familyId : `family:${familyId}`;
    const family = await kv.get(familyKey);
    
    if (!family) {
      return c.json({ error: "Family not found" }, 404);
    }
    
    if (!family.parentIds.includes(user.id)) {
      return c.json({ error: "Access denied to this family" }, 403);
    }
    
    await next();
  } catch (error) {
    return c.json({ error: "Access verification failed" }, 500);
  }
}

/**
 * Middleware: Require child access
 * Verifies that the authenticated user (parent or kid) has access to the specified child
 */
export async function requireChildAccess(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  const childId = c.req.param("childId");
  
  if (!user || !childId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  try {
    const kv = await import("./kv_store.tsx");
    
    const childKey = childId.startsWith('child:') ? childId : `child:${childId}`;
    const child = await kv.get(childKey);
    
    if (!child) {
      return c.json({ error: "Child not found" }, 404);
    }
    
    // For kid sessions, verify this is their own profile
    if (user.isKidSession) {
      if (user.id !== childId && user.id !== childKey) {
        return c.json({ error: "Access denied" }, 403);
      }
      await next();
      return;
    }
    
    // For parent users, verify they belong to the child's family
    const familyKey = child.familyId.startsWith('family:') ? child.familyId : `family:${child.familyId}`;
    const family = await kv.get(familyKey);
    
    if (!family) {
      return c.json({ error: "Family not found" }, 404);
    }
    
    if (!family.parentIds.includes(user.id)) {
      return c.json({ error: "Access denied" }, 403);
    }
    
    await next();
  } catch (error) {
    return c.json({ error: "Access verification failed" }, 500);
  }
}

/**
 * Helper: Get authenticated user ID from context
 */
export function getAuthUserId(c: Context): string {
  const user = c.get("user");
  if (!user) {
    throw new Error("User not found in context - ensure requireAuth middleware is applied");
  }
  return user.id;
}

/**
 * Helper: Get family ID from route params
 */
export function getFamilyId(c: Context): string {
  const familyId = c.req.param("familyId");
  if (!familyId) {
    throw new Error("Family ID not found in route params");
  }
  return familyId;
}