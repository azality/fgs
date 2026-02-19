/**
 * API Wrapper with Dual Auth Support
 * 
 * Automatically uses correct Authorization header based on mode:
 * - Parent mode: Supabase JWT (Bearer token from getSession())
 * - Kid mode: Kid access token (Bearer kid_xxxxx)
 */

import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';
import { getAuthToken, getCurrentMode, logout } from '/src/app/utils/auth';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// Track if we're redirecting to prevent multiple redirects
let isRedirecting = false;

/**
 * Redirect to appropriate login based on last known mode
 */
function redirectToLogin(reason: string) {
  if (isRedirecting) {
    console.log('⏭️ Already redirecting, skipping duplicate');
    return;
  }
  
  isRedirecting = true;
  console.log('🚪 Redirecting to login:', reason);
  
  // Determine which login page to redirect to
  const mode = getCurrentMode();
  const loginPage = mode === 'kid' ? '/kid-login' : '/parent-login';
  
  // Don't clear localStorage on redirect - let user choose mode
  console.log(`🔄 Redirecting to ${loginPage}`);
  window.location.replace(loginPage);
  
  throw new Error('REDIRECTING_TO_LOGIN');
}

/**
 * Main API call function with dual auth support
 */
export async function apiCall(
  endpoint: string, 
  options: RequestInit = {}
): Promise<any> {
  // Prevent API calls during redirect
  if (isRedirecting) {
    throw new Error('Redirecting to login...');
  }
  
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // ALWAYS include apikey header (required by Supabase)
  headers['apikey'] = publicAnonKey;

  // Get the appropriate auth token based on current mode
  const { token, type } = await getAuthToken();
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log(`🔑 API call with ${type} token:`, endpoint);
  } else {
    console.log('📡 API call without auth:', endpoint);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      console.warn('⚠️ 401 Unauthorized - session invalid');
      
      // Logout current mode and redirect
      await logout();
      redirectToLogin('Session expired or invalid');
      
      throw new Error('Unauthorized');
    }

    // Handle other error codes
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API error ${response.status}:`, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message === 'REDIRECTING_TO_LOGIN') {
      throw error;
    }
    
    console.error('❌ API call failed:', error);
    throw error;
  }
}

// ===== CONVENIENCE METHODS =====

export async function get(endpoint: string): Promise<any> {
  return apiCall(endpoint, { method: 'GET' });
}

export async function post(endpoint: string, data?: any): Promise<any> {
  return apiCall(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function put(endpoint: string, data?: any): Promise<any> {
  return apiCall(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function patch(endpoint: string, data?: any): Promise<any> {
  return apiCall(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function del(endpoint: string): Promise<any> {
  return apiCall(endpoint, { method: 'DELETE' });
}

// ===== PUBLIC ENDPOINTS (no auth required) =====

/**
 * Make API call without authentication
 * Use for public endpoints like kid login, family lookup, etc.
 */
export async function publicApiCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // Only include apikey, no Authorization header
  headers['apikey'] = publicAnonKey;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Public API error ${response.status}:`, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Public API call failed:', error);
    throw error;
  }
}

export default { get, post, put, patch, del, apiCall, publicApiCall };
