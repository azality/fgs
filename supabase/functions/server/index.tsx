// FGS Backend Server v1.0.2 - JWT Auth Fixed
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { 
  requireAuth, 
  requireParent, 
  requireFamilyAccess,
  requireChildAccess,
  getAuthUserId,
  getFamilyId,
  serviceRoleClient
} from "./middleware.tsx";
import {
  validate,
  validateSignup,
  validateFamily,
  validateChild,
  validatePointEvent,
  validateVoid,
  validateTrackableItem,
  validateChallenge,
  validateInvite,
  validateInviteAccept,
  validatePinVerify,
  validateProvider,
  validateAttendance,
  validateMilestone,
  validateReward,
  validateWishlistItem,
  validateQuiz,
  validateQuizAttempt,
  getValidatedBody
} from "./validation.tsx";
import {
  rateLimitLogin,
  rateLimitPinVerify,
  rateLimitEventCreate,
  rateLimitApi,
  RATE_LIMITS,
  rateLimit
} from "./rateLimit.tsx";
import {
  createInvite,
  validateInvite as checkInvite,
  acceptInvite,
  getFamilyInvites,
  revokeInvite
} from "./invites.tsx";
import {
  createKidSession,
  verifyKidSession,
  revokeKidSession,
  revokeAllChildSessions,
  getChildSessions,
  trackPinFailure,
  resetPinFailures,
  isPinLocked,
  getDeviceHash
} from "./kidSessions.tsx";

const app = new Hono();

// Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Logger disabled for bundle size optimization

// Enable CORS for all routes and methods with credentials support
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "authorization", "x-client-info", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length", "Content-Type"],
    maxAge: 600,
    credentials: false,
  }),
);

// EXPLICIT OPTIONS handler for debugging CORS
app.options("*", (c) => {
  // Return CORS headers explicitly
  return c.text("", 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, x-client-info, apikey",
    "Access-Control-Max-Age": "600"
  });
});

// Health check endpoint
app.get("/make-server-f116e23f/health", (c) => {
  return c.json({ status: "ok" });
});

// PUBLIC: Get children for family (no auth required)
// Used by kid login to display available children
app.get("/make-server-f116e23f/public/families/:familyId/children", async (c) => {
  try {
    const familyId = c.req.param('familyId');
    console.log(`📡 Public request for family ${familyId} children`);
    
    if (!familyId) {
      return c.json({ error: 'Family ID required' }, 400);
    }
    
    const allChildren = await kv.getByPrefix('child:');
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    
    const publicChildren = familyChildren.map((child: any) => ({
      id: child.id,
      name: child.name,
      avatar: child.avatar || '👶',
      familyId: child.familyId
    }));
    
    console.log(`✅ Returning ${publicChildren.length} children`);
    return c.json(publicChildren);
  } catch (error) {
    console.error('❌ Error in public children endpoint:', error);
    return c.json({ error: 'Failed to get children' }, 500);
  }
});

// NEW: Verify family code and return kids (no auth required)
// Used by kid login to validate family code and show kid selection
app.post("/make-server-f116e23f/public/verify-family-code", async (c) => {
  try {
    const { familyCode } = await c.req.json();
    
    if (!familyCode || typeof familyCode !== 'string') {
      return c.json({ 
        success: false, 
        error: 'Family code is required' 
      }, 400);
    }
    
    // Look up family by invite code
    const familyId = await kv.get(`invite:${familyCode.toUpperCase()}`);
    
    if (!familyId) {
      return c.json({ 
        success: false, 
        error: 'Invalid family code' 
      }, 404);
    }
    
    // Get family info
    const family = await kv.get(familyId);
    
    if (!family) {
      return c.json({ 
        success: false, 
        error: 'Family not found' 
      }, 404);
    }
    
    // Get all children in the family
    const allChildren = await kv.getByPrefix('child:');
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    
    // Return public kid info for selection
    const kids = familyChildren.map((child: any) => ({
      id: child.id,
      name: child.name,
      avatar: child.avatar || '👶'
    }));
    
    return c.json({
      success: true,
      familyId,
      familyName: family.name,
      kids,
      message: `Welcome to ${family.name}! 🏡`
    });
    
  } catch (error) {
    console.error('Error verifying family code:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to verify family code' 
    }, 500);
  }
});

// ===== AUTHENTICATION =====

// Sign up new user (parent)
app.post(
  "/make-server-f116e23f/auth/signup",
  validate(validateSignup),
  async (c) => {
    try {
      const { email, password, name, role } = getValidatedBody(c);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: role || 'parent' },
      // Automatically confirm email since email server not configured
      email_confirm: true
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }
    
    // Create user record in KV store
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      role: role || 'parent',
      createdAt: new Date().toISOString()
    });

    return c.json({ user: data.user, success: true });
  } catch (error) {
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Get user by ID
app.get(
  "/make-server-f116e23f/users/:userId",
  requireAuth,
  async (c) => {
    try {
      const userId = c.req.param('userId');
      const authenticatedUserId = getAuthUserId(c);
      
      if (userId !== authenticatedUserId) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      
      const user = await kv.get(`user:${userId}`);
      
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      
      return c.json(user);
    } catch (error) {
      return c.json({ error: 'Failed to get user' }, 500);
    }
  }
);

// ===== FAMILIES & CHILDREN =====

// Create family
app.post(
  "/make-server-f116e23f/families",
  requireAuth,
  requireParent,
  validate(validateFamily),
  async (c) => {
    try {
      const { name, parentIds } = getValidatedBody(c);
      const userId = getAuthUserId(c);
      const familyId = `family:${Date.now()}`;
      
      // Generate a unique 6-character invite code
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const family = {
        id: familyId,
        name,
        parentIds: parentIds || [userId],
        inviteCode,
        createdAt: new Date().toISOString()
      };
      
      await kv.set(familyId, family);
      
      // Store invite code mapping for quick lookup
      await kv.set(`invite:${inviteCode}`, familyId);
      
      // Update user record with familyId
      const user = await kv.get(`user:${userId}`);
      if (user) {
        user.familyId = familyId;
        await kv.set(`user:${userId}`, user);
      }
      
      return c.json(family);
    } catch (error) {
      return c.json({ error: 'Failed to create family' }, 500);
    }
});

// Get user's families
app.get(
  "/make-server-f116e23f/families",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get user to find their familyId
      const user = await kv.get(`user:${userId}`);
      
      if (!user || !user.familyId) {
        return c.json([]);
      }
      
      // Get the family details
      const family = await kv.get(user.familyId);
      
      if (!family) {
        return c.json([]);
      }
      
      return c.json([family]);
    } catch (error) {
      return c.json({ error: 'Failed to get families' }, 500);
    }
  }
);

// Get family by ID
app.get(
  "/make-server-f116e23f/families/:id",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const id = c.req.param('id');
    const family = await kv.get(id);
    
    if (!family) {
      return c.json({ error: 'Family not found' }, 404);
    }
    
    return c.json(family);
  } catch (error) {
    return c.json({ error: 'Failed to get family' }, 500);
  }
});

// Join family by invite code
app.post(
  "/make-server-f116e23f/families/join",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { inviteCode } = await c.req.json();
      const userId = getAuthUserId(c);
      
      if (!inviteCode || typeof inviteCode !== 'string') {
        return c.json({ error: 'Invalid invite code' }, 400);
      }
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${inviteCode.toUpperCase()}`);
      
      if (!familyId) {
        return c.json({ error: 'Invalid or expired invite code' }, 404);
      }
      
      const family = await kv.get(familyId);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Check if user is already in a family
      const user = await kv.get(`user:${userId}`);
      
      if (user?.familyId && user.familyId !== familyId) {
        return c.json({ error: 'You are already part of another family. Please contact support to switch families.' }, 400);
      }
      
      // Add user to family's parent list if not already there
      if (!family.parentIds.includes(userId)) {
        family.parentIds.push(userId);
        await kv.set(familyId, family);
      }
      
      // Update user record with familyId
      if (user) {
        user.familyId = familyId;
        await kv.set(`user:${userId}`, user);
      }
      
      return c.json({ 
        success: true, 
        family,
        message: `Successfully joined ${family.name}!` 
      });
    } catch (error) {
      return c.json({ error: 'Failed to join family' }, 500);
    }
  }
);

// ===== JOIN REQUEST SYSTEM (Approval Required) =====

// Submit join request (requires admin approval)
app.post(
  "/make-server-f116e23f/families/join-request",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { inviteCode, requestedRole, relationship } = await c.req.json();
      const userId = getAuthUserId(c);
      
      if (!inviteCode || typeof inviteCode !== 'string') {
        return c.json({ error: 'Invalid invite code' }, 400);
      }
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${inviteCode.toUpperCase()}`);
      
      if (!familyId) {
        return c.json({ error: 'Invalid or expired invite code' }, 404);
      }
      
      const family = await kv.get(familyId);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Check if user is already in a family
      const user = await kv.get(`user:${userId}`);
      
      if (user?.familyId) {
        return c.json({ error: 'You are already part of a family' }, 400);
      }
      
      // Check if user already has a pending request
      const existingRequests = await kv.getByPrefix('joinreq:');
      const userPendingRequest = existingRequests.find(
        (req: any) => req.requesterId === userId && req.status === 'pending'
      );
      
      if (userPendingRequest) {
        return c.json({ 
          error: 'You already have a pending join request', 
          existingRequest: userPendingRequest 
        }, 400);
      }
      
      // Create join request
      const requestId = `joinreq:${Date.now()}:${userId}`;
      const joinRequest = {
        id: requestId,
        familyId,
        requesterId: userId,
        requesterName: user?.name || 'Unknown',
        requesterEmail: user?.email || 'Unknown',
        requestedRole: requestedRole || 'parent',
        relationship: relationship || 'spouse',
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null
      };
      
      await kv.set(requestId, joinRequest);
      
      return c.json({ 
        success: true, 
        request: joinRequest,
        message: `Join request submitted to ${family.name}. Waiting for admin approval.` 
      });
    } catch (error) {
      console.error('Join request error:', error);
      return c.json({ error: 'Failed to submit join request' }, 500);
    }
  }
);

// Get pending join requests for a family (admin only)
app.get(
  "/make-server-f116e23f/families/:familyId/join-requests",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      
      // Get all join requests
      const allRequests = await kv.getByPrefix('joinreq:');
      
      // Filter by family and pending status
      const pendingRequests = allRequests.filter(
        (req: any) => req.familyId === familyId && req.status === 'pending'
      );
      
      return c.json(pendingRequests);
    } catch (error) {
      console.error('Get join requests error:', error);
      return c.json({ error: 'Failed to get join requests' }, 500);
    }
  }
);

// Approve join request (admin only)
app.post(
  "/make-server-f116e23f/families/:familyId/join-requests/:requestId/approve",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      const requestId = c.req.param('requestId');
      const reviewerId = getAuthUserId(c);
      
      // Get the join request
      const joinRequest = await kv.get(requestId);
      
      if (!joinRequest) {
        return c.json({ error: 'Join request not found' }, 404);
      }
      
      if (joinRequest.familyId !== familyId) {
        return c.json({ error: 'Join request does not belong to this family' }, 403);
      }
      
      if (joinRequest.status !== 'pending') {
        return c.json({ error: 'Join request already processed' }, 400);
      }
      
      // Get family and user
      const family = await kv.get(familyId);
      const requester = await kv.get(`user:${joinRequest.requesterId}`);
      
      if (!family || !requester) {
        return c.json({ error: 'Family or user not found' }, 404);
      }
      
      // Add user to family
      if (!family.parentIds.includes(joinRequest.requesterId)) {
        family.parentIds.push(joinRequest.requesterId);
        await kv.set(familyId, family);
      }
      
      // Update user record
      requester.familyId = familyId;
      requester.role = joinRequest.requestedRole;
      await kv.set(`user:${joinRequest.requesterId}`, requester);
      
      // Update join request status
      joinRequest.status = 'approved';
      joinRequest.reviewedBy = reviewerId;
      joinRequest.reviewedAt = new Date().toISOString();
      await kv.set(requestId, joinRequest);
      
      return c.json({ 
        success: true, 
        message: `${requester.name} has been added to ${family.name}!`,
        family,
        joinRequest
      });
    } catch (error) {
      console.error('Approve join request error:', error);
      return c.json({ error: 'Failed to approve join request' }, 500);
    }
  }
);

// Deny join request (admin only)
app.post(
  "/make-server-f116e23f/families/:familyId/join-requests/:requestId/deny",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      const requestId = c.req.param('requestId');
      const reviewerId = getAuthUserId(c);
      
      // Get the join request
      const joinRequest = await kv.get(requestId);
      
      if (!joinRequest) {
        return c.json({ error: 'Join request not found' }, 404);
      }
      
      if (joinRequest.familyId !== familyId) {
        return c.json({ error: 'Join request does not belong to this family' }, 403);
      }
      
      if (joinRequest.status !== 'pending') {
        return c.json({ error: 'Join request already processed' }, 400);
      }
      
      // Update join request status
      joinRequest.status = 'denied';
      joinRequest.reviewedBy = reviewerId;
      joinRequest.reviewedAt = new Date().toISOString();
      await kv.set(requestId, joinRequest);
      
      return c.json({ 
        success: true, 
        message: 'Join request denied',
        joinRequest
      });
    } catch (error) {
      console.error('Deny join request error:', error);
      return c.json({ error: 'Failed to deny join request' }, 500);
    }
  }
);

// Get my own join request (no familyId required)
app.get(
  "/make-server-f116e23f/auth/my-join-request",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get all join requests
      const allRequests = await kv.getByPrefix('joinreq:');
      
      // Find requests by this user (should only be one active)
      const myRequests = allRequests.filter(
        (req: any) => req.requesterId === userId
      );
      
      // Return the most recent one
      if (myRequests.length > 0) {
        const mostRecent = myRequests.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        return c.json(mostRecent);
      }
      
      return c.json({ error: 'No join request found' }, 404);
    } catch (error) {
      console.error('Get my join request error:', error);
      return c.json({ error: 'Failed to get join request' }, 500);
    }
  }
);

// Generate or regenerate invite code for existing family
app.post(
  "/make-server-f116e23f/families/:id/generate-invite-code",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const family = await kv.get(id);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Generate a new unique 6-character invite code
      let inviteCode: string;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        attempts++;
        
        // Check if this code is already in use
        const existingFamilyId = await kv.get(`invite:${inviteCode}`);
        if (!existingFamilyId || existingFamilyId === id) {
          break; // Code is available or already belongs to this family
        }
        
        if (attempts >= maxAttempts) {
          return c.json({ error: 'Failed to generate unique invite code. Please try again.' }, 500);
        }
      } while (attempts < maxAttempts);
      
      // Remove old invite code mapping if it exists
      if (family.inviteCode) {
        await kv.del(`invite:${family.inviteCode}`);
      }
      
      // Update family with new invite code
      family.inviteCode = inviteCode;
      await kv.set(id, family);
      
      // Store new invite code mapping
      await kv.set(`invite:${inviteCode}`, id);
      
      return c.json({ 
        success: true, 
        inviteCode,
        message: 'Invite code generated successfully!' 
      });
    } catch (error) {
      console.error('Error generating invite code:', error);
      return c.json({ error: 'Failed to generate invite code' }, 500);
    }
  }
);

// Create child
app.post(
  "/make-server-f116e23f/children",
  requireAuth,
  requireParent,
  validate(validateChild),
  async (c) => {
    try {
      const { name, familyId, avatar, pin } = getValidatedBody(c);
      const childId = `child:${Date.now()}`;
      
      // Hash the PIN for security (simple hash for demo, use bcrypt in production)
      const hashedPin = pin ? await hashPin(pin) : null;
      
      const child = {
        id: childId,
        name,
        familyId,
        avatar: avatar || '👶',
        pin: hashedPin,
        currentPoints: 0,
        highestMilestone: 0,
        targetRewardId: null,
        createdAt: new Date().toISOString()
      };
      
      await kv.set(childId, child);
      
      // Return child without PIN
      const { pin: _, ...childWithoutPin } = child;
      return c.json(childWithoutPin);
    } catch (error) {
      return c.json({ error: 'Failed to create child' }, 500);
    }
  }
);

// Verify child PIN
app.post(
  "/make-server-f116e23f/children/:id/verify-pin",
  validate(validatePinVerify),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { pin, rememberDevice } = getValidatedBody(c);
      
      // Get device hash for rate limiting
      const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Real-IP") || c.req.header("X-Forwarded-For")?.split(',')[0] || "unknown";
      const userAgent = c.req.header("User-Agent") || "unknown";
      const deviceHash = getDeviceHash(ip, userAgent);
      
      // Check if PIN attempts are locked
      const lockStatus = await isPinLocked(id, deviceHash);
      if (lockStatus.locked) {
        return c.json({
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          locked: true,
          retryAfter: lockStatus.retryAfter
        }, 429);
      }
      
      const child = await kv.get(id);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      const hashedPin = await hashPin(pin);
      if (child.pin === hashedPin) {
        // ✅ PIN correct - create kid session
        const { token, expiresAt } = await createKidSession(id, rememberDevice || false);
        
        // Reset failure tracking
        await resetPinFailures(id, deviceHash);
        
        const { pin: _, ...childWithoutPin } = child;
        
        return c.json({
          success: true,
          child: childWithoutPin,
          kidSessionToken: token,
          expiresAt,
          message: `Welcome back, ${child.name} ✨`
        });
      } else {
        // ❌ PIN incorrect - track failure
        const failureResult = await trackPinFailure(id, deviceHash);
        
        if (failureResult.locked) {
          return c.json({
            success: false,
            error: `Too many failed attempts. Locked for ${Math.ceil((failureResult.retryAfter || 0) / 60)} minutes.`,
            locked: true,
            retryAfter: failureResult.retryAfter
          }, 429);
        }
        
        return c.json({
          success: false,
          error: 'Oops — try again 🌙',
          attemptsRemaining: failureResult.attemptsRemaining
        }, 401);
      }
    } catch (error) {
      return c.json({ error: 'Failed to verify PIN' }, 500);
    }
  }
);

// Simple PIN hashing function
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// NEW: Kid Login with Family Code + Child ID
// POST /kid/login - Auth endpoint for kids using family code + childId + PIN
app.post(
  "/make-server-f116e23f/kid/login",
  async (c) => {
    try {
      const { familyCode, childId, pin } = await c.req.json();
      
      if (!familyCode || !childId || !pin) {
        return c.json({ 
          success: false, 
          error: 'Family code, child ID, and PIN are required' 
        }, 400);
      }
      
      // Get device hash for rate limiting
      const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Real-IP") || c.req.header("X-Forwarded-For")?.split(',')[0] || "unknown";
      const userAgent = c.req.header("User-Agent") || "unknown";
      const deviceHash = getDeviceHash(ip, userAgent);
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${familyCode.toUpperCase()}`);
      if (!familyId) {
        return c.json({ 
          success: false, 
          error: 'Invalid family code' 
        }, 404);
      }
      
      // Get the child directly by ID
      const child = await kv.get(childId);
      
      if (!child) {
        return c.json({ 
          success: false, 
          error: 'Child not found' 
        }, 404);
      }
      
      // Verify child belongs to the family
      if (child.familyId !== familyId) {
        return c.json({ 
          success: false, 
          error: 'Child not found in this family' 
        }, 404);
      }
      
      // Check if PIN attempts are locked
      const lockStatus = await isPinLocked(child.id, deviceHash);
      if (lockStatus.locked) {
        return c.json({
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          locked: true,
          retryAfter: lockStatus.retryAfter
        }, 429);
      }
      
      // Verify PIN
      const hashedPin = await hashPin(pin);
      if (child.pin !== hashedPin) {
        // Track failure
        const failureResult = await trackPinFailure(child.id, deviceHash);
        
        if (failureResult.locked) {
          return c.json({
            success: false,
            error: `Too many failed attempts. Locked for ${Math.ceil((failureResult.retryAfter || 0) / 60)} minutes.`,
            locked: true,
            retryAfter: failureResult.retryAfter
          }, 429);
        }
        
        return c.json({
          success: false,
          error: 'Incorrect PIN. Try again! 🌙',
          attemptsRemaining: failureResult.attemptsRemaining
        }, 401);
      }
      
      // PIN correct - create kid session
      const { token, expiresAt } = await createKidSession(child.id, false);
      
      // Reset failure tracking
      await resetPinFailures(child.id, deviceHash);
      
      // Return kid access token and info
      const { pin: _, ...childWithoutPin } = child;
      
      return c.json({
        success: true,
        kidAccessToken: token,
        kid: {
          id: child.id,
          name: child.name,
          avatar: child.avatar,
          familyId: familyId
        },
        familyCode: familyCode.toUpperCase(),
        expiresAt,
        message: `Welcome back, ${child.name}! ✨`
      });
      
    } catch (error) {
      console.error('Kid login error:', error);
      return c.json({ 
        success: false, 
        error: 'Login failed. Please try again.' 
      }, 500);
    }
  }
);

// PUBLIC ENDPOINT: Get children for kid login screen (no auth required)
// This endpoint returns basic child info (id, name, avatar) for display on kid login
// It deliberately excludes sensitive fields like PINs
app.get(
  "/make-server-f116e23f/families/:familyId/children/public",
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      
      const allChildren = await kv.getByPrefix('child:');
      const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
      
      const publicChildren = familyChildren.map((child: any) => ({
        id: child.id,
        name: child.name,
        avatar: child.avatar || '👶',
        familyId: child.familyId
      }));
      
      return c.json(publicChildren);
    } catch (error) {
      return c.json({ error: 'Failed to get children' }, 500);
    }
  }
);

// Get children by family
app.get(
  "/make-server-f116e23f/families/:familyId/children",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const familyId = c.req.param('familyId');
    const allChildren = await kv.getByPrefix('child:');
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    
    return c.json(familyChildren);
  } catch (error) {
    return c.json({ error: 'Failed to get children' }, 500);
  }
});

// Get child by ID
app.get(
  "/make-server-f116e23f/children/:id",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const id = c.req.param('id');
    const child = await kv.get(id);
    
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    return c.json(child);
  } catch (error) {
    return c.json({ error: 'Failed to get child' }, 500);
  }
});

// Update child points
app.patch(
  "/make-server-f116e23f/children/:id",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const child = await kv.get(id);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    const updated = { ...child, ...updates };
    await kv.set(id, updated);
    
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update child' }, 500);
  }
});

// ===== POINT EVENTS =====

// Log point event
app.post(
  "/make-server-f116e23f/events",
  requireAuth,
  requireParent,
  validate(validatePointEvent),
  async (c) => {
    try {
      const eventData = getValidatedBody(c);
    const { idempotencyKey, childId, trackableItemId } = eventData;
    
    // Generate event ID early (needed for claim-first pattern)
    const eventId = `event:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    // === IDEMPOTENCY: Claim-first pattern (KV-safe) ===
    if (idempotencyKey) {
      const claimKey = `eventclaim:${idempotencyKey}`;
      
      // Try to atomically claim this idempotency key with our eventId
      const claimed = await kv.setIfAbsent(claimKey, {
        eventId,
        createdAt: new Date().toISOString(),
        status: 'PENDING'
      });
      
      if (!claimed) {
        // Claim already exists - return the existing event
        const existingClaim = await kv.get(claimKey);
        
        if (existingClaim.eventId) {
          const existingEvent = await kv.get(existingClaim.eventId);
          if (existingEvent) {
            return c.json(existingEvent);
          }
        }
      }
    }
    
    // === SINGLETON: Lock-first pattern (KV-safe) ===
    if (trackableItemId) {
      const item = await kv.get(trackableItemId);
      if (item && item.isSingleton) {
        const today = new Date().toISOString().split('T')[0];
        const singletonKey = `singleton:${childId}:${trackableItemId}:${today}`;
        
        // Try to atomically acquire singleton lock
        const locked = await kv.setIfAbsent(singletonKey, {
          eventId,
          performedBy: eventData.loggedBy,
          timestamp: new Date().toISOString(),
          status: 'PENDING'
        });
        
        if (!locked) {
          // Lock already exists - singleton conflict
          const existingLock = await kv.get(singletonKey);
          const existingEvent = await kv.get(existingLock.eventId);
          const performedByUser = await kv.get(`user:${existingLock.performedBy}`);
          
          if (idempotencyKey) {
            await kv.del(`eventclaim:${idempotencyKey}`);
          }
          
          return c.json({
            error: 'Singleton already logged',
            conflict: {
              eventId: existingLock.eventId,
              loggedBy: performedByUser?.name || 'Another parent',
              loggedAt: existingEvent?.timestamp,
              item: item.name
            }
          }, 409);
        }
        // If we get here, we successfully acquired the singleton lock
      }
    }
    
    // === DAILY CAP: Lock-protected check (KV-safe) ===
    if (childId && eventData.points > 0 && !eventData.isAdjustment && !eventData.isRecovery && !eventData.challengeId && !eventData.quizId) {
      const today = new Date().toISOString().split('T')[0];
      const capLockKey = `caplock:${childId}:${today}`;
      
      // Try to acquire cap lock (with retry logic)
      let capLockAcquired = false;
      let retries = 0;
      const maxRetries = 5;
      
      while (!capLockAcquired && retries < maxRetries) {
        capLockAcquired = await kv.setIfAbsent(capLockKey, {
          holder: eventId,
          acquiredAt: new Date().toISOString()
        });
        
        if (!capLockAcquired) {
          // Lock held by another request - wait briefly and retry
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
          
          // Check if lock is stale (older than 3 seconds)
          const existingLock = await kv.get(capLockKey);
          if (existingLock && existingLock.acquiredAt) {
            const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
            if (lockAge > 3000) {
              // Stale lock - force release and retry
              await kv.del(capLockKey);
            }
          }
        }
        retries++;
      }
      
      if (!capLockAcquired) {
        // Could not acquire lock after retries
        
        // Release our claims
        if (idempotencyKey) await kv.del(`eventclaim:${idempotencyKey}`);
        if (trackableItemId) {
          const item = await kv.get(trackableItemId);
          if (item?.isSingleton) {
            await kv.del(`singleton:${childId}:${trackableItemId}:${today}`);
          }
        }
        
        return c.json({ error: 'System busy, please retry' }, 503);
      }
      
      try {
        // Lock acquired - perform cap check and update atomically
        const child = await kv.get(childId);
        if (child) {
          const lastReset = child.lastResetDate || '';
          
          // Reset daily counter if new day
          if (lastReset !== today) {
            child.dailyPointsEarned = 0;
            child.lastResetDate = today;
          }
          
          const cap = child.dailyPointsCap || 50;
          const currentDaily = child.dailyPointsEarned || 0;
          
          if (currentDaily + eventData.points > cap) {
            // Cap exceeded - release all locks and return error
            await kv.del(capLockKey);
            if (idempotencyKey) await kv.del(`eventclaim:${idempotencyKey}`);
            if (trackableItemId) {
              const item = await kv.get(trackableItemId);
              if (item?.isSingleton) {
                await kv.del(`singleton:${childId}:${trackableItemId}:${today}`);
              }
            }
            
            return c.json({ 
              error: 'Daily point cap reached', 
              cap, 
              current: currentDaily,
              message: `Daily cap of ${cap} points reached. Current: ${currentDaily}. This would exceed by ${(currentDaily + eventData.points) - cap} points.`
            }, 400);
          }
          
          // Update daily earned (atomic under lock)
          child.dailyPointsEarned = currentDaily + eventData.points;
          await kv.set(childId, child);
        }
      } finally {
        // Release cap lock
        await kv.del(capLockKey);
      }
    }
    
    // === CREATE EVENT (all locks acquired) ===
    const event = {
      id: eventId,
      ...eventData,
      timestamp: new Date().toISOString(),
      idempotencyKey: idempotencyKey || null,
      status: 'active'
    };
    
    await kv.set(eventId, event);
    
    // Finalize idempotency claim (update status from PENDING to ACTIVE)
    if (idempotencyKey) {
      await kv.set(`eventclaim:${idempotencyKey}`, {
        eventId,
        createdAt: event.timestamp,
        status: 'ACTIVE'
      });
    }
    
    // Finalize singleton lock (update status from PENDING to ACTIVE)
    if (trackableItemId) {
      const item = await kv.get(trackableItemId);
      if (item && item.isSingleton) {
        const today = new Date().toISOString().split('T')[0];
        const singletonKey = `singleton:${childId}:${trackableItemId}:${today}`;
        await kv.set(singletonKey, {
          eventId,
          performedBy: eventData.loggedBy,
          timestamp: event.timestamp,
          status: 'ACTIVE'
        });
      }
    }
    
    // === UPDATE CHILD POINTS (Ledger-first approach) ===
    if (childId && eventData.points) {
      const child = await kv.get(childId);
      if (child) {
        // Use integer points only (round if fractional)
        const pointsToAdd = Math.round(eventData.points);
        let newPoints = child.currentPoints + pointsToAdd;
        const newHighest = Math.max(child.highestMilestone || 0, newPoints);
        
        // Milestone floor protection - cannot go below highest milestone
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= newHighest)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        if (newPoints < floor) {
          newPoints = floor;
        }
        
        // Ensure points never go negative
        if (newPoints < 0) {
          newPoints = 0;
        }
        
        // Update streak if it's a habit
        let streakData = child.streaks || {};
        if (trackableItemId && eventData.points > 0) {
          const item = await kv.get(trackableItemId);
          if (item && item.type === 'habit') {
            const today = new Date().toISOString().split('T')[0];
            const currentStreak = streakData[trackableItemId] || { current: 0, longest: 0, lastLogged: null };
            
            // Check if logged yesterday (consecutive)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (currentStreak.lastLogged === yesterdayStr) {
              // Continue streak
              currentStreak.current += 1;
              currentStreak.longest = Math.max(currentStreak.longest, currentStreak.current);
            } else if (currentStreak.lastLogged === today) {
              // Already logged today, don't increment
            } else {
              // Start new streak or reset
              currentStreak.current = 1;
              currentStreak.longest = Math.max(currentStreak.longest || 0, 1);
            }
            
            currentStreak.lastLogged = today;
            streakData[trackableItemId] = currentStreak;
          }
        }
        
        await kv.set(childId, {
          ...child,
          currentPoints: newPoints,
          highestMilestone: newHighest,
          streaks: streakData
        });
      }
    }
    
    return c.json(event);
  } catch (error) {
    return c.json({ error: 'Failed to log event', details: String(error) }, 500);
  }
});

// Get events for child
app.get(
  "/make-server-f116e23f/children/:childId/events",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allEvents = await kv.getByPrefix('event:');
    const childEvents = allEvents
      .filter((event: any) => event.childId === childId && event.status !== 'voided') // Exclude voided events
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return c.json(childEvents);
  } catch (error) {
    return c.json({ error: 'Failed to get events' }, 500);
  }
});

// Void/soft-delete event (no hard deletes allowed)
app.post(
  "/make-server-f116e23f/events/:id/void",
  requireAuth,
  requireParent,
  validate(validateVoid),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { voidReason } = getValidatedBody(c);
      const voidedBy = getAuthUserId(c);
    
    if (!voidReason || voidReason.trim().length < 10) {
      return c.json({ error: 'Void reason required (minimum 10 characters)' }, 400);
    }
    
    const event = await kv.get(id);
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }
    
    // IDEMPOTENCY: If already voided, return existing voided event (don't re-apply)
    if (event.status === 'voided') {
      return c.json(event);
    }
    
    const voidClaimKey = `voidclaim:${id}`;
    const existingClaim = await kv.get(voidClaimKey);
    
    if (existingClaim) {
      const voidedEvent = await kv.get(id);
      return c.json(voidedEvent);
    }
    
    // Claim the void operation
    await kv.set(voidClaimKey, { voidedBy, timestamp: new Date().toISOString() });
    
    // Mark as voided (soft delete)
    const voidedEvent = {
      ...event,
      status: 'voided',
      voidedBy,
      voidedAt: new Date().toISOString(),
      voidReason
    };
    
    await kv.set(id, voidedEvent);
    
    // Reverse the points from the child (ONCE - idempotent due to claim key)
    if (event.childId && event.points) {
      const child = await kv.get(event.childId);
      if (child) {
        const reversedPoints = child.currentPoints - event.points;
        const newPoints = Math.max(0, reversedPoints); // Never go negative
        
        // Apply milestone floor
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= child.highestMilestone)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        const finalPoints = Math.max(newPoints, floor);
        
        await kv.set(event.childId, {
          ...child,
          currentPoints: finalPoints
        });
      }
    }
    
    return c.json(voidedEvent);
  } catch (error) {
    return c.json({ error: 'Failed to void event', details: String(error) }, 500);
  }
});

// ===== ATTENDANCE =====

// Create attendance record
app.post(
  "/make-server-f116e23f/attendance",
  requireAuth,
  requireParent,
  validate(validateAttendance),
  async (c) => {
  try {
    const recordData = await c.req.json();
    const recordId = `attendance:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const record = {
      id: recordId,
      ...recordData,
      timestamp: new Date().toISOString()
    };
    
    await kv.set(recordId, record);
    return c.json(record);
  } catch (error) {
    return c.json({ error: 'Failed to create attendance record' }, 500);
  }
});

// Get attendance for child
app.get(
  "/make-server-f116e23f/children/:childId/attendance",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allRecords = await kv.getByPrefix('attendance:');
    const childRecords = allRecords
      .filter((record: any) => record.childId === childId)
      .sort((a: any, b: any) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
    
    return c.json(childRecords);
  } catch (error) {
    return c.json({ error: 'Failed to get attendance' }, 500);
  }
});

// ===== PROVIDERS =====

// Create provider
app.post(
  "/make-server-f116e23f/providers",
  requireAuth,
  requireParent,
  validate(validateProvider),
  async (c) => {
  try {
    const providerData = await c.req.json();
    const providerId = `provider:${Date.now()}`;
    
    const provider = {
      id: providerId,
      ...providerData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(providerId, provider);
    return c.json(provider);
  } catch (error) {
    return c.json({ error: 'Failed to create provider' }, 500);
  }
});

// Get all providers
app.get(
  "/make-server-f116e23f/providers",
  requireAuth,
  async (c) => {
  try {
    const providers = await kv.getByPrefix('provider:');
    return c.json(providers);
  } catch (error) {
    return c.json({ error: 'Failed to get providers' }, 500);
  }
});

// Update provider
app.put(
  "/make-server-f116e23f/providers/:id",
  requireAuth,
  requireParent,
  validate(validateProvider),
  async (c) => {
  try {
    const { id } = c.req.param();
    const updateData = await c.req.json();
    
    const existing = await kv.get(id);
    if (!existing) {
      return c.json({ error: 'Provider not found' }, 404);
    }
    
    const updated = {
      ...existing,
      ...updateData,
      id, // Keep original ID
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(id, updated);
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update provider' }, 500);
  }
});

// Delete provider
app.delete(
  "/make-server-f116e23f/providers/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const { id } = c.req.param();
    await kv.del(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete provider' }, 500);
  }
});

// ===== CHALLENGES =====

// Challenge templates (defined once, used to generate instances)
const challengeTemplates = [
  // Daily - Easy
  {
    id: 'tpl_daily_fajr',
    type: 'daily',
    title: '🌅 Early Riser',
    description: 'Pray Fajr on time today',
    difficulty: 'easy',
    bonusPoints: 5,
    category: 'salah',
    icon: '🌅',
    requirements: [{ type: 'specific-items', target: 1, itemIds: ['item1'], description: 'Complete Fajr prayer' }]
  },
  {
    id: 'tpl_daily_help',
    type: 'daily',
    title: '🤝 Helpful Hero',
    description: 'Help a family member today',
    difficulty: 'easy',
    bonusPoints: 3,
    category: 'social',
    icon: '🤝',
    requirements: [{ type: 'specific-items', target: 1, itemIds: ['item12'], description: 'Help a sibling or parent' }]
  },
  {
    id: 'tpl_daily_clean',
    type: 'daily',
    title: '✨ Clean Sweep',
    description: 'Clean your room without being asked',
    difficulty: 'easy',
    bonusPoints: 3,
    category: 'general',
    icon: '✨',
    requirements: [{ type: 'specific-items', target: 1, itemIds: ['item13'], description: 'Clean your room' }]
  },
  // Daily - Medium
  {
    id: 'tpl_daily_all_salah',
    type: 'daily',
    title: '🕌 Prayer Warrior',
    description: 'Pray all 5 daily prayers on time',
    difficulty: 'medium',
    bonusPoints: 10,
    category: 'salah',
    icon: '🕌',
    requirements: [{ type: 'specific-items', target: 5, itemIds: ['item1', 'item2', 'item3', 'item4', 'item5'], description: 'Complete all 5 prayers' }]
  },
  {
    id: 'tpl_daily_positive_day',
    type: 'daily',
    title: '😇 Perfect Behavior',
    description: 'Go the whole day with no negative behaviors',
    difficulty: 'medium',
    bonusPoints: 8,
    category: 'general',
    icon: '😇',
    requirements: [{ type: 'count', target: 0, description: 'Zero negative events today' }]
  },
  // Daily - Hard
  {
    id: 'tpl_daily_super_day',
    type: 'daily',
    title: '🌟 Super Star Day',
    description: 'Earn 30+ points in positive actions today',
    difficulty: 'hard',
    bonusPoints: 15,
    category: 'general',
    icon: '🌟',
    requirements: [{ type: 'total-points', target: 30, description: 'Earn 30 points from positive actions' }]
  },
  // Weekly - Easy
  {
    id: 'tpl_weekly_quran',
    type: 'weekly',
    title: '📖 Quran Reader',
    description: 'Read Quran 5 times this week',
    difficulty: 'easy',
    bonusPoints: 10,
    category: 'learning',
    icon: '📖',
    requirements: [{ type: 'specific-items', target: 5, itemIds: ['item6'], description: 'Complete Quran reading 5 times' }]
  },
  {
    id: 'tpl_weekly_homework',
    type: 'weekly',
    title: '📚 Study Champion',
    description: 'Complete homework on time every day this week',
    difficulty: 'easy',
    bonusPoints: 12,
    category: 'learning',
    icon: '📚',
    requirements: [{ type: 'specific-items', target: 5, itemIds: ['item7'], description: 'Complete homework 5 times' }]
  },
  // Weekly - Medium
  {
    id: 'tpl_weekly_fajr_streak',
    type: 'weekly',
    title: '🔥 Fajr Streak Master',
    description: 'Pray Fajr every day this week (7 days)',
    difficulty: 'medium',
    bonusPoints: 20,
    category: 'salah',
    icon: '🔥',
    requirements: [{ type: 'streak', target: 7, itemIds: ['item1'], description: 'Maintain 7-day Fajr streak' }]
  },
  {
    id: 'tpl_weekly_helper',
    type: 'weekly',
    title: '💪 Helping Hand Hero',
    description: 'Help others 10 times this week',
    difficulty: 'medium',
    bonusPoints: 15,
    category: 'social',
    icon: '💪',
    requirements: [{ type: 'specific-items', target: 10, itemIds: ['item12'], description: 'Help 10 times' }]
  },
  // Weekly - Hard
  {
    id: 'tpl_weekly_perfect',
    type: 'weekly',
    title: '🏆 Perfect Week',
    description: 'Complete all prayers, homework, and have zero negative behaviors',
    difficulty: 'hard',
    bonusPoints: 50,
    category: 'general',
    icon: '🏆',
    requirements: [
      { type: 'specific-items', target: 35, itemIds: ['item1', 'item2', 'item3', 'item4', 'item5'], description: 'All prayers (5×7 = 35)' },
      { type: 'specific-items', target: 5, itemIds: ['item7'], description: 'All homework (5 days)' },
      { type: 'count', target: 0, description: 'Zero negative behaviors' }
    ]
  }
];

// Calculate challenge progress based on point events
async function calculateChallengeProgress(challenge: any, childId: string) {
  try {
    const allEvents = await kv.getByPrefix('event:');
    
    // Filter events for this child and challenge time range
    const relevantEvents = allEvents.filter((e: any) => {
      if (e.childId !== childId) return false;
      const eventDate = new Date(e.timestamp);
      const challengeStart = challenge.acceptedAt ? new Date(challenge.acceptedAt) : new Date(challenge.createdAt);
      return eventDate >= challengeStart && eventDate <= new Date(challenge.expiresAt);
    });

    let current = 0;
    const target = challenge.requirements[0].target;

    if (challenge.requirements[0].type === 'specific-items') {
      // Count events matching the item IDs
      current = relevantEvents.filter((e: any) => 
        challenge.requirements[0].itemIds.includes(e.trackableItemId) && e.points > 0
      ).length;
    } else if (challenge.requirements[0].type === 'total-points') {
      // Sum positive points
      current = relevantEvents
        .filter((e: any) => e.points > 0 && !e.isAdjustment && !e.isRecovery)
        .reduce((sum: number, e: any) => sum + e.points, 0);
    } else if (challenge.requirements[0].type === 'count') {
      // Count negative events (for "zero negatives" challenges)
      current = relevantEvents.filter((e: any) => e.points < 0).length;
    }

    const percentage = Math.min(100, Math.round((current / target) * 100));
    const isComplete = challenge.requirements[0].type === 'count' 
      ? current === 0 // For "zero negatives", must be exactly 0
      : current >= target;

    return { current, target, percentage, isComplete };
  } catch (error) {
    return { current: 0, target: challenge.requirements[0].target, percentage: 0, isComplete: false };
  }
}

// Generate daily challenges for a child
app.post(
  "/make-server-f116e23f/children/:childId/challenges/generate",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const { type } = await c.req.json(); // 'daily' or 'weekly'
    
    // Get existing challenges for this child
    const existingChallenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    // Filter templates by type
    const templates = challengeTemplates.filter(t => t.type === type);
    
    // Randomly select 2-3 challenges
    const selectedTemplates = [];
    const numChallenges = type === 'daily' ? 3 : 2;
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(numChallenges, shuffled.length); i++) {
      selectedTemplates.push(shuffled[i]);
    }
    
    // Create challenge instances
    const newChallenges = [];
    const now = new Date();
    
    for (const template of selectedTemplates) {
      const challengeId = `challenge:${childId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      
      const expiresAt = type === 'daily'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - now.getDay()), 23, 59, 59);
      
      const challenge = {
        id: challengeId,
        childId,
        templateId: template.id,
        type: template.type,
        title: template.title,
        description: template.description,
        difficulty: template.difficulty,
        bonusPoints: template.bonusPoints,
        status: 'available',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        requirements: template.requirements,
        progress: { current: 0, target: template.requirements[0].target, percentage: 0, isComplete: false },
        icon: template.icon,
        category: template.category
      };
      
      await kv.set(challengeId, challenge);
      newChallenges.push(challenge);
    }
    
    return c.json({ challenges: newChallenges, count: newChallenges.length });
  } catch (error) {
    return c.json({ error: 'Failed to generate challenges' }, 500);
  }
});

// Get challenges for a child
app.get(
  "/make-server-f116e23f/children/:childId/challenges",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const challenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    // Update progress for all challenges (READ-ONLY - no side effects)
    const updatedChallenges = await Promise.all(
      challenges.map(async (challenge: any) => {
        if (challenge.status === 'accepted' || challenge.status === 'available') {
          const progress = await calculateChallengeProgress(challenge, childId);
          // Return challenge with updated progress, but don't modify stored challenge
          return { ...challenge, progress };
        }
        return challenge;
      })
    );
    
    // Sort: accepted first, then available, then completed
    const sorted = updatedChallenges.sort((a: any, b: any) => {
      const order = { accepted: 0, available: 1, completed: 2, expired: 3, failed: 4 };
      return order[a.status] - order[b.status];
    });
    
    return c.json(sorted);
  } catch (error) {
    return c.json({ error: 'Failed to get challenges' }, 500);
  }
});

// Evaluate challenge completion (EXPLICIT endpoint - idempotent)
app.post(
  "/make-server-f116e23f/children/:childId/challenges/evaluate",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const challenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    const completedChallenges = [];
    
    for (const challenge of challenges) {
      if (challenge.status === 'accepted') {
        const progress = await calculateChallengeProgress(challenge, childId);
        
        // IDEMPOTENCY: Only complete if status is still 'accepted'
        if (progress.isComplete && challenge.status === 'accepted') {
          // Atomically mark as completed
          const current = await kv.get(challenge.id);
          if (current && current.status === 'accepted') {
            current.status = 'completed';
            current.completedAt = new Date().toISOString();
            await kv.set(challenge.id, current);
            
            // Award bonus points (idempotent - use unique event ID based on challenge ID)
            const eventId = `event:challenge:${challenge.id}:${Date.now()}`;
            const existingEvent = await kv.get(eventId);
            
            if (!existingEvent) {
              const event = {
                id: eventId,
                childId,
                trackableItemId: 'challenge_bonus',
                points: challenge.bonusPoints,
                timestamp: new Date().toISOString(),
                loggedBy: 'system',
                notes: `Challenge completed: ${challenge.title}`,
                isAdjustment: false,
                challengeId: challenge.id,
                status: 'active'
              };
              await kv.set(eventId, event);
              
              // Update child points
              const child = await kv.get(childId);
              if (child) {
                child.currentPoints += challenge.bonusPoints;
                if (child.currentPoints > child.highestMilestone) {
                  child.highestMilestone = child.currentPoints;
                }
                await kv.set(childId, child);
              }
              
              completedChallenges.push(current);
            }
          }
        }
      }
    }
    
    return c.json({ 
      evaluated: completedChallenges.length,
      completed: completedChallenges
    });
  } catch (error) {
    return c.json({ error: 'Failed to evaluate challenges' }, 500);
  }
});

// Get challenge analytics for parent dashboard
app.get(
  "/make-server-f116e23f/children/:childId/challenge-analytics",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const allChallenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    const stats = {
      totalChallenges: allChallenges.length,
      completed: allChallenges.filter((ch: any) => ch.status === 'completed').length,
      active: allChallenges.filter((ch: any) => ch.status === 'accepted').length,
      available: allChallenges.filter((ch: any) => ch.status === 'available').length,
      totalBonusEarned: allChallenges
        .filter((ch: any) => ch.status === 'completed')
        .reduce((sum: number, ch: any) => sum + ch.bonusPoints, 0),
      completionRate: allChallenges.length > 0 
        ? Math.round((allChallenges.filter((ch: any) => ch.status === 'completed').length / allChallenges.length) * 100)
        : 0,
      byDifficulty: {
        easy: allChallenges.filter((ch: any) => ch.difficulty === 'easy' && ch.status === 'completed').length,
        medium: allChallenges.filter((ch: any) => ch.difficulty === 'medium' && ch.status === 'completed').length,
        hard: allChallenges.filter((ch: any) => ch.difficulty === 'hard' && ch.status === 'completed').length
      },
      byCategory: {
        salah: allChallenges.filter((ch: any) => ch.category === 'salah' && ch.status === 'completed').length,
        learning: allChallenges.filter((ch: any) => ch.category === 'learning' && ch.status === 'completed').length,
        social: allChallenges.filter((ch: any) => ch.category === 'social' && ch.status === 'completed').length,
        general: allChallenges.filter((ch: any) => ch.category === 'general' && ch.status === 'completed').length
      }
    };
    
    return c.json(stats);
  } catch (error) {
    return c.json({ error: 'Failed to get analytics' }, 500);
  }
});

// ===== TRACKABLE ITEMS =====

// Create trackable item
app.post(
  "/make-server-f116e23f/trackable-items",
  requireAuth,
  requireParent,
  validate(validateTrackableItem),
  async (c) => {
  try {
    const itemData = await c.req.json();
    const itemId = `item:${Date.now()}`;
    
    const item = {
      id: itemId,
      ...itemData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(itemId, item);
    return c.json(item);
  } catch (error) {
    return c.json({ error: 'Failed to create trackable item' }, 500);
  }
});

// Get all trackable items
app.get(
  "/make-server-f116e23f/trackable-items",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const items = await kv.getByPrefix('item:');
    
    // Deduplicate items by name (keep oldest based on timestamp in ID)
    const itemsByName = new Map<string, any>();
    for (const item of items) {
      const existing = itemsByName.get(item.name);
      if (!existing) {
        itemsByName.set(item.name, item);
      } else {
        // Keep the item with the earlier timestamp
        const existingTime = parseInt(existing.id.split(':')[1] || '0');
        const currentTime = parseInt(item.id.split(':')[1] || '0');
        if (currentTime < existingTime) {
          itemsByName.set(item.name, item);
        }
      }
    }
    
    // Return deduplicated items as array
    const deduplicatedItems = Array.from(itemsByName.values());
    return c.json(deduplicatedItems);
  } catch (error) {
    return c.json({ error: 'Failed to get trackable items' }, 500);
  }
});

// Deduplicate trackable items (admin/debug endpoint)
app.post(
  "/make-server-f116e23f/trackable-items/dedupe",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const items = await kv.getByPrefix('item:');
    
    // Group items by name
    const itemsByName = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByName.has(item.name)) {
        itemsByName.set(item.name, []);
      }
      itemsByName.get(item.name)!.push(item);
    }
    
    // Find duplicates
    const duplicates: any[] = [];
    for (const [name, itemList] of itemsByName.entries()) {
      if (itemList.length > 1) {
        // Keep the oldest item (earliest timestamp in ID), delete the rest
        itemList.sort((a, b) => {
          const aTime = parseInt(a.id.split(':')[1] || '0');
          const bTime = parseInt(b.id.split(':')[1] || '0');
          return aTime - bTime;
        });
        
        const toKeep = itemList[0];
        const toDelete = itemList.slice(1);
        
        for (const item of toDelete) {
          await kv.del(item.id);
          duplicates.push({ name, deletedId: item.id });
        }
      }
    }
    
    return c.json({ 
      message: 'Deduplication complete', 
      duplicatesRemoved: duplicates.length,
      details: duplicates
    });
  } catch (error) {
    return c.json({ error: 'Failed to deduplicate items' }, 500);
  }
});

// ===== MILESTONES =====

// Create milestone
app.post(
  "/make-server-f116e23f/milestones",
  requireAuth,
  requireParent,
  validate(validateMilestone),
  async (c) => {
  try {
    const milestoneData = await c.req.json();
    const milestoneId = `milestone:${Date.now()}`;
    
    const milestone = {
      id: milestoneId,
      ...milestoneData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(milestoneId, milestone);
    return c.json(milestone);
  } catch (error) {
    return c.json({ error: 'Failed to create milestone' }, 500);
  }
});

// Get all milestones
app.get(
  "/make-server-f116e23f/milestones",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const milestones = await kv.getByPrefix('milestone:');
    return c.json(milestones.sort((a: any, b: any) => a.points - b.points));
  } catch (error) {
    return c.json({ error: 'Failed to get milestones' }, 500);
  }
});

// ===== REWARDS =====

// Create reward
app.post(
  "/make-server-f116e23f/rewards",
  requireAuth,
  requireParent,
  validate(validateReward),
  async (c) => {
  try {
    const rewardData = await c.req.json();
    const rewardId = `reward:${Date.now()}`;
    
    const reward = {
      id: rewardId,
      ...rewardData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(rewardId, reward);
    return c.json(reward);
  } catch (error) {
    return c.json({ error: 'Failed to create reward' }, 500);
  }
});

// Get all rewards
app.get(
  "/make-server-f116e23f/rewards",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const rewards = await kv.getByPrefix('reward:');
    return c.json(rewards.sort((a: any, b: any) => a.pointCost - b.pointCost));
  } catch (error) {
    return c.json({ error: 'Failed to get rewards' }, 500);
  }
});

// ===== WISHLIST =====

// Create wishlist item (Kids can submit wishes)
app.post(
  "/make-server-f116e23f/wishlists",
  requireAuth,
  validate(validateWishlistItem),
  async (c) => {
  try {
    const wishlistData = await c.req.json();
    const wishlistId = `wishlist:${Date.now()}`;
    
    const wishlistItem = {
      id: wishlistId,
      ...wishlistData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await kv.set(wishlistId, wishlistItem);
    return c.json(wishlistItem);
  } catch (error) {
    return c.json({ error: 'Failed to create wishlist item' }, 500);
  }
});

// Get all wishlist items for family
app.get(
  "/make-server-f116e23f/wishlists",
  requireAuth,
  async (c) => {
  try {
    const wishlists = await kv.getByPrefix('wishlist:');
    const sorted = wishlists.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return c.json(sorted);
  } catch (error) {
    return c.json({ error: 'Failed to get wishlists' }, 500);
  }
});

// Update wishlist item status (Parent only)
app.patch(
  "/make-server-f116e23f/wishlists/:wishlistId/status",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const { status } = await c.req.json();
    
    if (!['pending', 'approved', 'converted', 'rejected'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    const wishlist = await kv.get(wishlistKey);
    
    if (!wishlist) {
      return c.json({ error: 'Wishlist item not found' }, 404);
    }
    
    const updated = {
      ...wishlist,
      status,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(wishlistKey, updated);
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update wishlist status' }, 500);
  }
});

// Convert wishlist to reward (Parent only)
app.post(
  "/make-server-f116e23f/wishlists/:wishlistId/convert",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const { pointCost } = await c.req.json();
    
    if (!pointCost || pointCost <= 0) {
      return c.json({ error: 'Valid pointCost is required' }, 400);
    }
    
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    const wishlist = await kv.get(wishlistKey);
    
    if (!wishlist) {
      return c.json({ error: 'Wishlist item not found' }, 404);
    }
    
    // Auto-categorize based on points
    let category: 'small' | 'medium' | 'large' = 'small';
    if (pointCost >= 500) category = 'large';
    else if (pointCost >= 100) category = 'medium';
    
    // Create reward from wishlist
    const rewardId = `reward:${Date.now()}`;
    const reward = {
      id: rewardId,
      name: wishlist.wishText || 'Audio Wish Reward',
      category,
      pointCost,
      description: wishlist.audioUrl ? 'Wish submitted via audio' : undefined,
      fromWishlist: wishlistId,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(rewardId, reward);
    
    // Update wishlist status to converted
    const updatedWishlist = {
      ...wishlist,
      status: 'converted',
      convertedToRewardId: rewardId,
      updatedAt: new Date().toISOString()
    };
    await kv.set(wishlistKey, updatedWishlist);
    
    return c.json({ wishlist: updatedWishlist, reward });
  } catch (error) {
    return c.json({ error: 'Failed to convert wishlist to reward' }, 500);
  }
});

// Delete wishlist item (Parent only)
app.delete(
  "/make-server-f116e23f/wishlists/:wishlistId",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    
    await kv.del(wishlistKey);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete wishlist item' }, 500);
  }
});

// ===== QUIZZES =====

// Create quiz
app.post(
  "/make-server-f116e23f/quizzes",
  requireAuth,
  requireParent,
  validate(validateQuiz),
  async (c) => {
  try {
    const quizData = await c.req.json();
    const quizId = `quiz:${Date.now()}`;
    
    const quiz = {
      id: quizId,
      ...quizData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(quizId, quiz);
    return c.json(quiz);
  } catch (error) {
    return c.json({ error: 'Failed to create quiz' }, 500);
  }
});

// Get all quizzes
app.get(
  "/make-server-f116e23f/quizzes",
  requireAuth,
  async (c) => {
  try {
    const quizzes = await kv.getByPrefix('quiz:');
    return c.json(quizzes.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
  } catch (error) {
    return c.json({ error: 'Failed to get quizzes' }, 500);
  }
});

// Get quiz by ID
app.get(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  async (c) => {
  try {
    const id = c.req.param('id');
    const quiz = await kv.get(id);
    
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    return c.json(quiz);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz' }, 500);
  }
});

// Update quiz
app.patch(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  requireParent,
  validate(validateQuiz),
  async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const quiz = await kv.get(id);
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    const updated = { ...quiz, ...updates };
    await kv.set(id, updated);
    
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update quiz' }, 500);
  }
});

// Delete quiz
app.delete(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(id);
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete quiz' }, 500);
  }
});

// Submit quiz attempt
app.post(
  "/make-server-f116e23f/quiz-attempts",
  requireAuth,
  validate(validateQuizAttempt),
  async (c) => {
  try {
    const attemptData = await c.req.json();
    const attemptId = `quizattempt:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const attempt = {
      id: attemptId,
      ...attemptData,
      completedAt: new Date().toISOString()
    };
    
    await kv.set(attemptId, attempt);
    
    // Award points to child
    if (attemptData.childId && attemptData.pointsEarned > 0) {
      const child = await kv.get(attemptData.childId);
      if (child) {
        let newPoints = child.currentPoints + attemptData.pointsEarned;
        const newHighest = Math.max(child.highestMilestone || 0, newPoints);
        
        // Milestone floor protection
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= newHighest)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        if (newPoints < floor) {
          newPoints = floor;
        }
        
        await kv.set(attemptData.childId, {
          ...child,
          currentPoints: newPoints,
          highestMilestone: newHighest
        });
      }
    }
    
    return c.json(attempt);
  } catch (error) {
    return c.json({ error: 'Failed to submit quiz attempt' }, 500);
  }
});

// Get quiz attempts for a child
app.get(
  "/make-server-f116e23f/children/:childId/quiz-attempts",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allAttempts = await kv.getByPrefix('quizattempt:');
    const childAttempts = allAttempts
      .filter((attempt: any) => attempt.childId === childId)
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    return c.json(childAttempts);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz attempts' }, 500);
  }
});

// Get attempts for a specific quiz
app.get(
  "/make-server-f116e23f/quizzes/:quizId/attempts",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const quizId = c.req.param('quizId');
    const allAttempts = await kv.getByPrefix('quizattempt:');
    const quizAttempts = allAttempts
      .filter((attempt: any) => attempt.quizId === quizId)
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    return c.json(quizAttempts);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz attempts' }, 500);
  }
});

// ===== ADMIN RECONCILIATION TOOLS =====

// Recalculate child points from ledger (admin repair tool)
app.post(
  "/make-server-f116e23f/admin/recalculate-points/:childId",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    
    const child = await kv.get(childId);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    // Get all active (non-voided) events for this child
    const allEvents = await kv.getByPrefix('event:');
    const childEvents = allEvents.filter((e: any) => 
      e.childId === childId && e.status === 'active'
    );
    
    // Recalculate total from ledger
    const recalculatedPoints = childEvents.reduce((sum: number, e: any) => {
      return sum + (e.points || 0);
    }, 0);
    
    const currentPoints = child.currentPoints || 0;
    const difference = recalculatedPoints - currentPoints;
    
    // Update child with recalculated value
    const updatedChild = {
      ...child,
      currentPoints: Math.max(0, recalculatedPoints), // Never go negative
      lastReconciled: new Date().toISOString(),
      reconciledDifference: difference
    };
    
    await kv.set(childId, updatedChild);
    
    
    return c.json({
      success: true,
      before: currentPoints,
      after: recalculatedPoints,
      difference,
      eventsProcessed: childEvents.length,
      message: difference === 0 
        ? 'Points were already correct' 
        : `Points corrected by ${difference > 0 ? '+' : ''}${difference}`
    });
  } catch (error) {
    return c.json({ error: 'Failed to recalculate points', details: String(error) }, 500);
  }
});

// Health check with system stats
app.get(
  "/make-server-f116e23f/admin/system-stats",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const families = await kv.getByPrefix('family:');
    const children = await kv.getByPrefix('child:');
    const events = await kv.getByPrefix('event:');
    const challenges = await kv.getByPrefix('challenge:');
    const quizzes = await kv.getByPrefix('quiz:');
    
    const activeEvents = events.filter((e: any) => e.status === 'active');
    const voidedEvents = events.filter((e: any) => e.status === 'voided');
    
    return c.json({
      families: families.length,
      children: children.length,
      events: {
        total: events.length,
        active: activeEvents.length,
        voided: voidedEvents.length
      },
      challenges: challenges.length,
      quizzes: quizzes.length,
      systemHealth: 'operational'
    });
  } catch (error) {
    return c.json({ error: 'Failed to get system stats' }, 500);
  }
});

// ===== FAMILY INVITES =====

// Create family invite (Parent only)
app.post(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  validate(validateInvite),
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { email } = getValidatedBody(c);
      const invitedBy = getAuthUserId(c);
    
    const { inviteCode, expiresAt } = await createInvite(familyId, email, invitedBy);
    
    return c.json({
      success: true,
      inviteCode,
      expiresAt,
      email,
      familyId,
      message: `Invite code: ${inviteCode} (expires in 72 hours)`
    });
  } catch (error) {
    return c.json({ error: 'Failed to create invite', details: String(error) }, 500);
  }
});

// Get family invites (Parent only)
app.get(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const { familyId } = c.req.param();
    const invites = await getFamilyInvites(familyId);
    
    return c.json(invites);
  } catch (error) {
    return c.json({ error: 'Failed to get invites' }, 500);
  }
});

// Accept family invite (Public endpoint - creates new user account)
app.post(
  "/make-server-f116e23f/invites/accept",
  validate(validateInviteAccept),
  async (c) => {
    try {
      const { inviteCode, name, email, password } = getValidatedBody(c);
    
    // Validate invite
    const validation = await checkInvite(inviteCode, email);
    
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }
    
    const familyId = validation.familyId;
    
    // Create user account via Supabase Auth
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: 'parent' },
      email_confirm: true // Auto-confirm for beta
    });
    
    if (error) {
      return c.json({ error: error.message }, 400);
    }
    
    const userId = data.user.id;
    
    // Create user record in KV store
    await kv.set(`user:${userId}`, {
      id: userId,
      email,
      name,
      role: 'parent',
      familyId,
      createdAt: new Date().toISOString()
    });
    
    // Mark invite as accepted
    await acceptInvite(inviteCode, userId);
    
    // Add user to family's parent list
    const family = await kv.get(familyId);
    if (family) {
      const parentIds = family.parentIds || [];
      if (!parentIds.includes(userId)) {
        parentIds.push(userId);
      }
      await kv.set(familyId, {
        ...family,
        parentIds
      });
    }
    
    return c.json({
      success: true,
      user: data.user,
      familyId,
      message: 'Successfully joined family'
    });
  } catch (error) {
    return c.json({ error: 'Failed to accept invite', details: String(error) }, 500);
  }
});

// Revoke family invite (Parent only)
app.post("/make-server-f116e23f/invites/:code/revoke", async (c) => {
  try {
    const { code } = c.req.param();
    
    await revokeInvite(code);
    
    return c.json({ success: true, message: 'Invite revoked' });
  } catch (error) {
    return c.json({ error: 'Failed to revoke invite' }, 500);
  }
});

// ===== EDIT REQUESTS =====
// Get all edit requests for the user's families
app.get(
  "/make-server-f116e23f/edit-requests",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get all families where user is a member
      const familiesResult = await kv.getByPrefix(`family:`);
      const userFamilies = familiesResult
        .filter((f: any) => f.members?.includes(userId))
        .map((f: any) => f.id);
      
      // Get edit requests for all user's families
      const allRequests: any[] = [];
      for (const familyId of userFamilies) {
        const requests = await kv.getByPrefix(`edit_request:${familyId}:`);
        allRequests.push(...requests);
      }
      
      // Sort by createdAt descending (newest first)
      allRequests.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      return c.json(allRequests);
    } catch (error) {
      console.error('❌ Error fetching edit requests:', error);
      return c.json({ error: 'Failed to fetch edit requests' }, 500);
    }
  }
);

// Resolve an edit request (approve or reject)
app.post(
  "/make-server-f116e23f/edit-requests/:requestId/resolve",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { requestId } = c.req.param();
      const body = await c.req.json();
      const { status, resolverId, resolution } = body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return c.json({ error: 'Invalid status. Must be approved or rejected' }, 400);
      }
      
      // Get the edit request
      const request = await kv.get(requestId);
      if (!request) {
        return c.json({ error: 'Edit request not found' }, 404);
      }
      
      // Update the request status
      const updatedRequest = {
        ...request,
        status,
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolverId,
        resolution: resolution || ''
      };
      
      await kv.set(requestId, updatedRequest);
      
      // If approved, apply the changes to the original event
      if (status === 'approved' && request.proposedChanges) {
        const originalEvent = await kv.get(request.originalEventId);
        if (originalEvent) {
          const updatedEvent = {
            ...originalEvent,
            ...request.proposedChanges,
            lastModifiedAt: new Date().toISOString(),
            lastModifiedBy: resolverId
          };
          await kv.set(request.originalEventId, updatedEvent);
        }
      }
      
      return c.json({ 
        success: true, 
        message: status === 'approved' ? 'Edit request approved and changes applied' : 'Edit request rejected',
        request: updatedRequest 
      });
    } catch (error) {
      console.error('❌ Error resolving edit request:', error);
      return c.json({ error: 'Failed to resolve edit request' }, 500);
    }
  }
);

// Catch-all route for debugging
app.all('*', (c) => {
  return c.json({ error: 'Route not found', path: c.req.path }, 404);
});

Deno.serve(app.fetch);