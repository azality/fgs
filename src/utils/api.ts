import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// Temporary token cache to bridge the gap between login and session persistence
let temporaryTokenCache: string | null = null;

// Track refresh attempts to prevent rate limiting
let isRefreshing = false;
let refreshPromise: Promise<any> | null = null;
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 3000; // 3 seconds between refresh attempts

// Flag to prevent API calls during redirect
let isRedirecting = false;

// Export function to set temporary token (used immediately after login/signup)
export function setTemporaryToken(token: string | null) {
  temporaryTokenCache = token;
  console.log('🔑 Temporary token cache updated:', { hasToken: !!token });
}

// Helper to redirect to login and prevent further API calls
function redirectToLogin(reason: string) {
  if (isRedirecting) {
    console.log('⏭️ Already redirecting to login, skipping duplicate redirect');
    return;
  }
  
  isRedirecting = true;
  console.log('🚪 IMMEDIATE REDIRECT TO LOGIN:', reason);
  
  // Clear all auth data FIRST
  try {
    localStorage.clear(); // Clear everything to ensure clean state
  } catch (e) {
    console.error('Error clearing localStorage:', e);
  }
  
  // IMMEDIATE redirect - no setTimeout, no delays
  console.log('🔄 Executing window.location.replace to /parent-login');
  window.location.replace('/parent-login');
  
  // This line should never be reached, but just in case, throw error to stop execution
  throw new Error('REDIRECTING_TO_LOGIN');
}

// Helper for API calls with automatic token refresh
async function apiCall(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  // Prevent API calls if we're already redirecting to login
  if (isRedirecting) {
    console.log('⏭️ API call blocked - redirect to login in progress');
    throw new Error('Redirecting to login...');
  }
  
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // CRITICAL: Always include apikey header for Supabase Edge Functions
  // Even for unauthenticated endpoints, the apikey is required
  headers['apikey'] = publicAnonKey;

  // Get access token from Supabase session (most reliable source)
  let accessToken: string | null = null;
  let tokenSource: string = 'none';
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (!error && session?.access_token) {
      accessToken = session.access_token;
      tokenSource = 'supabase-session';
      
      // Validate token expiration
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const isExpired = expiresAt && expiresAt < now;
      
      if (isExpired) {
        console.warn('⚠️ Token is expired, attempting refresh before request...');
        // Try to refresh immediately
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          console.error('❌ Token refresh failed:', refreshError?.message);
          // Clear session and redirect to login
          await supabase.auth.signOut();
          redirectToLogin('Token refresh failed');
          throw new Error('Session expired. Please log in again.');
        }
        
        // Use refreshed token
        accessToken = refreshData.session.access_token;
        console.log('✅ Token refreshed successfully before request');
      }
      
      console.log('🔍 Session check for API call:', {
        endpoint,
        tokenSource,
        sessionUser: session.user?.id,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : 'N/A',
        isExpired,
        tokenPreview: `${session.access_token.substring(0, 30)}...`
      });
    } else if (error) {
      console.warn('⚠️ Error getting session for API call:', error.message);
      // Try to get a fresh session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        accessToken = refreshData.session.access_token;
        tokenSource = 'refreshed-session';
        console.log('✅ Session refreshed after error');
      }
    }
  } catch (error) {
    console.error('❌ Error getting session for API call:', error);
  }
  
  // Fallback to temporary token cache if session not available
  // NOTE: This should only be used immediately after login before session is persisted
  if (!accessToken && temporaryTokenCache) {
    console.warn('⚠️ Using temporary token cache as fallback (this should only happen immediately after login)');
    accessToken = temporaryTokenCache;
    tokenSource = 'temporary-cache';
    
    // DON'T clear the cache yet - keep it for multiple requests
    // The AuthContext will eventually override it with a real session
    console.log('✅ Using temporary token cache, keeping it for subsequent requests');
  }
  
  // CRITICAL: Only add Authorization header if we have a valid user access token
  if (!accessToken) {
    console.error('❌ No access token available - cannot make authenticated API call');
    console.error('❌ Debug info:', {
      endpoint,
      retryCount,
      tokenSource,
      temporaryCacheExists: !!temporaryTokenCache,
      localStorageKeys: Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth') || k.includes('sb-')).slice(0, 5)
    });
    
    // Redirect to login immediately
    redirectToLogin('No access token available');
    throw new Error('Session expired. Redirecting to login...');
  }
  
  // Additional validation: ensure token is a proper JWT (3 parts separated by dots)
  const tokenParts = accessToken.split('.');
  const isValidJWT = tokenParts.length === 3;
  if (!isValidJWT) {
    console.error('❌ Invalid JWT format - token does not have 3 parts:', {
      parts: tokenParts.length,
      tokenSource,
      tokenPreview: accessToken.substring(0, 50) + '...',
      isAnonKey: accessToken === publicAnonKey
    });
    
    // Clear temporary cache if it's holding a bad token
    if (tokenSource === 'temporary-cache') {
      console.log('🗑️ Clearing invalid temporary token cache');
      temporaryTokenCache = null;
    }
    
    // Redirect to login immediately
    redirectToLogin('Invalid JWT format');
    throw new Error('Invalid authentication token. Redirecting to login...');
  }
  
  headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log(`📥 Response from ${endpoint}:`, {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    tokenSource
  });

  // Handle 401 errors by attempting to refresh the token
  if (response.status === 401 && retryCount === 0) {
    console.log('⚠️ Received 401, attempting token refresh...');
    
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshAttempt;
    
    // Prevent refresh spam - only refresh if enough time has passed
    if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.warn(`⏳ Refresh cooldown active (${Math.ceil((REFRESH_COOLDOWN - timeSinceLastRefresh) / 1000)}s remaining). Redirecting to login.`);
      // Instead of throwing error, redirect to login
      redirectToLogin('Refresh cooldown active');
      throw new Error('Session expired. Redirecting to login...');
    }
    
    // If already refreshing, wait for that refresh to complete
    if (isRefreshing && refreshPromise) {
      console.log('⏳ Refresh already in progress, waiting...');
      try {
        await refreshPromise;
        // After refresh completes, retry the request once
        return apiCall(endpoint, options, 1);
      } catch (refreshError) {
        console.error('❌ Refresh failed:', refreshError);
        redirectToLogin('Refresh failed');
        throw new Error('Session refresh failed. Redirecting to login...');
      }
    }
    
    // Start new refresh
    isRefreshing = true;
    lastRefreshAttempt = now;
    
    refreshPromise = (async () => {
      try {
        // First check if we even have a session to refresh
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (!currentSession) {
          console.error('❌ No session found - cannot refresh. User needs to log in again.');
          throw new Error('Session expired. Please log in again.');
        }
        
        // Attempt to refresh the session using Supabase's built-in refresh
        console.log('🔄 Attempting to refresh session...');
        const { data: { session }, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('❌ Token refresh error:', error.message);
          throw new Error('Session refresh failed. Please log in again.');
        }

        if (session?.access_token) {
          console.log('✅ Token refreshed successfully:', {
            newTokenPreview: session.access_token.substring(0, 30) + '...',
            expiresAt: new Date(session.expires_at! * 1000).toISOString()
          });
          return session;
        } else {
          console.error('❌ No active session found after refresh');
          throw new Error('Session refresh failed. Please log in again.');
        }
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();
    
    try {
      await refreshPromise;
      // Retry the request with the new token (only once)
      return apiCall(endpoint, options, 1);
    } catch (refreshError) {
      console.error('❌ Failed to refresh token:', refreshError);
      // Clear session and redirect to login
      await supabase.auth.signOut();
      redirectToLogin('Failed to refresh token');
      throw new Error('Session expired. Redirecting to login...');
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error('❌ API Error:', { endpoint, status: response.status, error });
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ===== FAMILIES & CHILDREN =====

export async function createFamily(name: string, parentIds: string[]) {
  return apiCall('/families', {
    method: 'POST',
    body: JSON.stringify({ name, parentIds }),
  });
}

export async function joinFamilyByCode(inviteCode: string) {
  return apiCall('/families/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode }),
  });
}

export async function getFamily(familyId: string) {
  return apiCall(`/families/${familyId}`);
}

export async function generateInviteCode(familyId: string) {
  return apiCall(`/families/${familyId}/generate-invite-code`, {
    method: 'POST',
  });
}

export async function createChild(name: string, familyId: string, pin: string) {
  return apiCall('/children', {
    method: 'POST',
    body: JSON.stringify({ name, familyId, pin }),
  });
}

export async function getChildren(familyId: string) {
  return apiCall(`/families/${familyId}/children`);
}

export async function updateChild(childId: string, updates: any) {
  return apiCall(`/children/${childId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ===== POINT EVENTS =====

export async function checkSingleton(childId: string, itemId: string, userId: string) {
  return apiCall('/events/check-singleton', {
    method: 'POST',
    body: JSON.stringify({ childId, itemId, userId }),
  });
}

export async function checkDedupe(childId: string, itemId: string, userId: string) {
  return apiCall('/events/check-dedupe', {
    method: 'POST',
    body: JSON.stringify({ childId, itemId, userId }),
  });
}

export async function logPointEvent(eventData: any) {
  return apiCall('/events', {
    method: 'POST',
    body: JSON.stringify(eventData),
  });
}

export async function getChildEvents(childId: string) {
  return apiCall(`/children/${childId}/events`);
}

// ===== EDIT REQUESTS =====

export async function createEditRequest(requestData: any) {
  return apiCall('/edit-requests', {
    method: 'POST',
    body: JSON.stringify(requestData),
  });
}

export async function getEditRequests() {
  return apiCall('/edit-requests');
}

export async function resolveEditRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  resolvedBy: string,
  resolution?: string
) {
  return apiCall(`/edit-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolvedBy, resolution }),
  });
}

// ===== ATTENDANCE =====

export async function createAttendance(recordData: any) {
  return apiCall('/attendance', {
    method: 'POST',
    body: JSON.stringify(recordData),
  });
}

export async function getChildAttendance(childId: string) {
  return apiCall(`/children/${childId}/attendance`);
}

// ===== PROVIDERS =====

export async function createProvider(providerData: any) {
  return apiCall('/providers', {
    method: 'POST',
    body: JSON.stringify(providerData),
  });
}

export async function getProviders() {
  return apiCall('/providers');
}

// ===== TRACKABLE ITEMS =====

export async function createTrackableItem(itemData: any) {
  return apiCall('/trackable-items', {
    method: 'POST',
    body: JSON.stringify(itemData),
  });
}

export async function getTrackableItems() {
  return apiCall('/trackable-items');
}

export async function deduplicateTrackableItems() {
  return apiCall('/trackable-items/dedupe', {
    method: 'POST',
  });
}

// ===== MILESTONES =====

export async function createMilestone(milestoneData: any) {
  return apiCall('/milestones', {
    method: 'POST',
    body: JSON.stringify(milestoneData),
  });
}

export async function getMilestones() {
  return apiCall('/milestones');
}

// ===== REWARDS =====

export async function createReward(rewardData: any) {
  return apiCall('/rewards', {
    method: 'POST',
    body: JSON.stringify(rewardData),
  });
}

export async function getRewards() {
  return apiCall('/rewards');
}

// ===== WISHLIST =====

export async function createWishlistItem(wishlistData: any) {
  return apiCall('/wishlists', {
    method: 'POST',
    body: JSON.stringify(wishlistData),
  });
}

export async function getWishlists() {
  return apiCall('/wishlists');
}

export async function updateWishlistStatus(wishlistId: string, status: string) {
  return apiCall(`/wishlists/${wishlistId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function convertWishlistToReward(wishlistId: string, pointCost: number) {
  return apiCall(`/wishlists/${wishlistId}/convert`, {
    method: 'POST',
    body: JSON.stringify({ pointCost }),
  });
}

export async function deleteWishlist(wishlistId: string) {
  return apiCall(`/wishlists/${wishlistId}`, {
    method: 'DELETE',
  });
}

// ===== INITIALIZATION =====

export async function initializeDefaultData(familyId: string) {
  // Check if items already exist to prevent duplicates
  const existingItems = await getTrackableItems();
  
  if (existingItems.length > 0) {
    console.log('⏭️ Skipping default data initialization - items already exist');
    return;
  }
  
  // Create default trackable items
  const items = [
    { name: 'Fajr', type: 'habit', category: 'salah', points: 5, isReligious: true },
    { name: 'Dhuhr', type: 'habit', category: 'salah', points: 3, isReligious: true },
    { name: 'Asr', type: 'habit', category: 'salah', points: 3, isReligious: true },
    { name: 'Maghrib', type: 'habit', category: 'salah', points: 3, isReligious: true },
    { name: 'Isha', type: 'habit', category: 'salah', points: 3, isReligious: true },
    { name: 'Quran Reading', type: 'habit', category: 'quran', points: 5, isReligious: true },
    { name: 'Homework Complete', type: 'habit', category: 'homework', points: 10 },
    { name: 'Tantrum', type: 'behavior', tier: 'minor', points: -3, dedupeWindow: 15 },
    { name: 'Disrespect', type: 'behavior', tier: 'moderate', points: -5, dedupeWindow: 30 },
    { name: 'Lying', type: 'behavior', tier: 'major', points: -10, dedupeWindow: 60 },
    { name: 'Fighting', type: 'behavior', tier: 'moderate', points: -5, dedupeWindow: 20 },
    { name: 'Helped Sibling', type: 'behavior', points: 5 },
    { name: 'Cleaned Room', type: 'behavior', points: 3 },
  ];

  for (const item of items) {
    await createTrackableItem(item);
  }

  // Create default providers - check for existence first
  const existingProviders = await getProviders();
  if (existingProviders.length === 0) {
    const providers = [
      { name: 'Quran Academy', ratePerClass: 25 },
      { name: 'Arabic Tutoring', ratePerClass: 30 },
    ];

    for (const provider of providers) {
      await createProvider(provider);
    }
    console.log('✅ Created default providers');
  } else {
    console.log('⏭️ Skipping default providers - already exist');
  }

  // Create default milestones - check for existence first
  const existingMilestones = await getMilestones();
  if (existingMilestones.length === 0) {
    const milestones = [
      { points: 100, name: 'Bronze Achiever' },
      { points: 250, name: 'Silver Star' },
      { points: 500, name: 'Gold Champion' },
      { points: 1000, name: 'Diamond Leader' },
    ];

    for (const milestone of milestones) {
      await createMilestone(milestone);
    }
    console.log('✅ Created default milestones');
  } else {
    console.log('⏭️ Skipping default milestones - already exist');
  }

  // Create default rewards - check for existence first
  const existingRewards = await getRewards();
  if (existingRewards.length === 0) {
    const rewards = [
      { name: 'Extra Screen Time (30min)', category: 'small', pointCost: 50 },
      { name: 'Ice Cream Outing', category: 'small', pointCost: 75 },
      { name: 'New Book', category: 'small', pointCost: 60 },
      { name: 'Lego Set', category: 'medium', pointCost: 200, description: 'Star Wars Lego' },
      { name: 'Theme Park Visit', category: 'large', pointCost: 500 },
      { name: 'Gaming Console', category: 'large', pointCost: 1000 },
    ];

    for (const reward of rewards) {
      await createReward(reward);
    }
    console.log('✅ Created default rewards');
  } else {
    console.log('⏭️ Skipping default rewards - already exist');
  }
  
  console.log('✅ Default data initialization completed');
}

// Helper to get authentication headers
async function getAuthHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // CRITICAL: Always include apikey header for Supabase Edge Functions
  // Even for unauthenticated endpoints, the apikey is required
  headers['apikey'] = publicAnonKey;

  // Get access token from Supabase session (most reliable source)
  let accessToken: string | null = null;
  let tokenSource: string = 'none';
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (!error && session?.access_token) {
      accessToken = session.access_token;
      tokenSource = 'supabase-session';
      
      // Validate token expiration
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const isExpired = expiresAt && expiresAt < now;
      
      if (isExpired) {
        console.warn('⚠️ Token is expired, attempting refresh before request...');
        // Try to refresh immediately
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          console.error('❌ Token refresh failed:', refreshError?.message);
          // Clear session and redirect to login
          await supabase.auth.signOut();
          redirectToLogin('Token refresh failed');
          throw new Error('Session expired. Please log in again.');
        }
        
        // Use refreshed token
        accessToken = refreshData.session.access_token;
        console.log('✅ Token refreshed successfully before request');
      }
      
      console.log('🔍 Session check for API call:', {
        tokenSource,
        sessionUser: session.user?.id,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : 'N/A',
        isExpired,
        tokenPreview: `${session.access_token.substring(0, 30)}...`
      });
    } else if (error) {
      console.warn('⚠️ Error getting session for API call:', error.message);
      // Try to get a fresh session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        accessToken = refreshData.session.access_token;
        tokenSource = 'refreshed-session';
        console.log('✅ Session refreshed after error');
      }
    }
  } catch (error) {
    console.error('❌ Error getting session for API call:', error);
  }
  
  // Fallback to temporary token cache if session not available
  // NOTE: This should only be used immediately after login before session is persisted
  if (!accessToken && temporaryTokenCache) {
    console.warn('⚠️ Using temporary token cache as fallback (this should only happen immediately after login)');
    accessToken = temporaryTokenCache;
    tokenSource = 'temporary-cache';
    
    // DON'T clear the cache yet - keep it for multiple requests
    // The AuthContext will eventually override it with a real session
    console.log('✅ Using temporary token cache, keeping it for subsequent requests');
  }
  
  // CRITICAL: Only add Authorization header if we have a valid user access token
  if (!accessToken) {
    console.error('❌ No access token available - cannot make authenticated API call');
    console.error('❌ Debug info:', {
      retryCount,
      tokenSource,
      temporaryCacheExists: !!temporaryTokenCache,
      localStorageKeys: Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth') || k.includes('sb-')).slice(0, 5)
    });
    
    // Redirect to login immediately
    redirectToLogin('No access token available');
    throw new Error('Session expired. Redirecting to login...');
  }
  
  // Additional validation: ensure token is a proper JWT (3 parts separated by dots)
  const tokenParts = accessToken.split('.');
  const isValidJWT = tokenParts.length === 3;
  if (!isValidJWT) {
    console.error('❌ Invalid JWT format - token does not have 3 parts:', {
      parts: tokenParts.length,
      tokenSource,
      tokenPreview: accessToken.substring(0, 50) + '...',
      isAnonKey: accessToken === publicAnonKey
    });
    
    // Clear temporary cache if it's holding a bad token
    if (tokenSource === 'temporary-cache') {
      console.log('🗑️ Clearing invalid temporary token cache');
      temporaryTokenCache = null;
    }
    
    // Redirect to login immediately
    redirectToLogin('Invalid JWT format');
    throw new Error('Invalid authentication token. Redirecting to login...');
  }
  
  headers['Authorization'] = `Bearer ${accessToken}`;

  return headers;
}

// Export all functions as an object for easier importing
export const api = {
  // Families & Children
  createFamily,
  getFamily,
  createChild,
  getChildren,
  updateChild,
  
  // Point Events
  checkSingleton,
  checkDedupe,
  logPointEvent,
  getChildEvents,
  
  // Edit Requests
  createEditRequest,
  getEditRequests,
  resolveEditRequest,
  
  // Attendance
  createAttendance,
  getChildAttendance,
  
  // Providers
  createProvider,
  getProviders,
  
  // Trackable Items
  createTrackableItem,
  getTrackableItems,
  deduplicateTrackableItems,
  
  // Milestones
  createMilestone,
  getMilestones,
  
  // Rewards
  createReward,
  getRewards,
  
  // Wishlist
  createWishlistItem,
  getWishlists,
  updateWishlistStatus,
  convertWishlistToReward,
  deleteWishlist,
  
  // Initialization
  initializeDefaultData,
};