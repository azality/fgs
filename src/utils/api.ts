import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

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

  try {
    localStorage.clear();
  } catch (e) {
    console.error('Error clearing localStorage:', e);
  }

  console.log('🔄 Executing window.location.replace to /parent-login');
  window.location.replace('/parent-login');

  // stop execution
  throw new Error('REDIRECTING_TO_LOGIN');
}

// Get best token for request (kid token first, else supabase session)
async function getAccessTokenForRequest(): Promise<{ token: string | null; source: string }> {
  // ✅ kid token wins
  const kidToken =
    localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
  if (kidToken) {
    console.log('👶 Kid mode detected - using kid access token for API call:', {
      tokenPreview: `${kidToken.substring(0, 30)}...`,
    });
    return { token: kidToken, source: 'kid-session' };
  }

  // parent mode uses supabase session
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('⚠️ Error getting session:', error.message);
    }

    if (session?.access_token) {
      // validate expiration
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const isExpired = !!expiresAt && expiresAt < now;

      if (isExpired) {
        console.warn('⚠️ Token expired, refreshing before request...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session?.access_token) {
          console.error('❌ Token refresh failed:', refreshError?.message);

          // deleted user safety
          const msg = refreshError?.message || '';
          if (
            msg.includes('user_not_found') ||
            msg.includes('User from sub claim in JWT does not exist')
          ) {
            console.error('🚨 CRITICAL: User account deleted but session still exists!');
            await supabase.auth.signOut();
            redirectToLogin('User account deleted');
          }

          await supabase.auth.signOut();
          redirectToLogin('Token refresh failed');
        }

        return { token: refreshData.session.access_token, source: 'refreshed-session' };
      }

      return { token: session.access_token, source: 'supabase-session' };
    }

    // fallback: try refresh if no session token
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.access_token) {
      console.log('✅ Session refreshed (no session initially)');
      return { token: refreshData.session.access_token, source: 'refreshed-session' };
    }
  } catch (e) {
    console.error('❌ Error getting token:', e);
  }

  // fallback to temp cache
  if (temporaryTokenCache) {
    console.warn(
      '⚠️ Using temporary token cache fallback (should only happen right after login)'
    );
    return { token: temporaryTokenCache, source: 'temporary-cache' };
  }

  return { token: null, source: 'none' };
}

// Validate JWT format (skip for kid tokens)
function assertValidToken(token: string, source: string) {
  if (source === 'kid-session') {
    console.log('✅ Kid token detected - skipping JWT format validation');
    return;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('❌ Invalid JWT format:', {
      parts: parts.length,
      source,
      tokenPreview: token.substring(0, 50) + '...',
      isAnonKey: token === publicAnonKey,
    });

    if (source === 'temporary-cache') {
      console.log('🗑️ Clearing invalid temporary token cache');
      temporaryTokenCache = null;
    }

    redirectToLogin('Invalid JWT format');
  }
}

// Shared request executor (native uses CapacitorHttp, web uses fetch)
async function executeRequest(
  url: string,
  options: RequestInit,
  headers: Record<string, string>,
  endpoint: string,
  tokenSource: string,
  retryCount: number
): Promise<any> {
  // ✅ iOS/Android native path
  if (Capacitor.isNativePlatform()) {
    const method = (options.method || 'GET').toUpperCase();

    let data: any = undefined;
    if (options.body) {
      if (typeof options.body === 'string') {
        try {
          data = JSON.parse(options.body);
        } catch {
          data = options.body;
        }
      } else {
        data = options.body;
      }
    }

    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data,
    });

    console.log(`📥 Native response from ${endpoint}:`, {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      tokenSource,
      retryCount,
      dataPreview:
        typeof res.data === 'string'
          ? res.data.slice(0, 200)
          : JSON.stringify(res.data ?? {}).slice(0, 200),
    });

    return { status: res.status, ok: res.status >= 200 && res.status < 300, data: res.data };
  }

  // 🌐 web path
  const response = await fetch(url, { ...options, headers });
  let json: any = null;

  try {
    json = await response.clone().json();
  } catch {
    // ignore
  }

  console.log(`📥 Web response from ${endpoint}:`, {
    status: response.status,
    ok: response.ok,
    tokenSource,
    retryCount,
  });

  return { status: response.status, ok: response.ok, data: json };
}

// Helper for API calls with automatic token refresh
async function apiCall(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  if (isRedirecting) {
    console.log('⏭️ API call blocked - redirect to login in progress');
    throw new Error('Redirecting to login...');
  }

  const url = `${API_BASE}${endpoint}`;

  // Base headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  // CRITICAL: Supabase Edge Functions require apikey header
  headers['apikey'] = publicAnonKey;

  // token
  const { token: accessToken, source: tokenSource } = await getAccessTokenForRequest();

  if (!accessToken) {
    console.error('❌ No access token available - cannot make authenticated API call', {
      endpoint,
      retryCount,
      tokenSource,
      temporaryCacheExists: !!temporaryTokenCache,
    });
    redirectToLogin('No access token available');
  }

  assertValidToken(accessToken!, tokenSource);

  headers['Authorization'] = `Bearer ${accessToken}`;
  headers['X-Supabase-Auth'] = `Bearer ${accessToken}`; // workaround

  console.log('📤 API Request Headers:', {
    endpoint,
    tokenSource,
    hasAuthorization: !!headers['Authorization'],
    hasXSupabaseAuth: !!headers['X-Supabase-Auth'],
    authPreview: headers['Authorization']?.substring(0, 30) + '...',
  });

  const res = await executeRequest(url, options, headers, endpoint, tokenSource, retryCount);

  // Handle 403 deleted-user detection
  if (res.status === 403) {
    const errorStr = JSON.stringify(res.data ?? {});
    if (
      errorStr.includes('user_not_found') ||
      errorStr.includes('User from sub claim in JWT does not exist') ||
      errorStr.includes('User does not exist')
    ) {
      console.error('🚨 CRITICAL: User account deleted but session still exists!');
      await supabase.auth.signOut();
      redirectToLogin('User account deleted');
    }
  }

  // Handle 401 refresh (only once)
  if (res.status === 401 && retryCount === 0) {
    console.log('⚠️ Received 401, attempting token refresh...');

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshAttempt;

    if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.warn('⏳ Refresh cooldown active. Redirecting to login.');
      redirectToLogin('Refresh cooldown active');
    }

    if (isRefreshing && refreshPromise) {
      console.log('⏳ Refresh already in progress, waiting...');
      await refreshPromise;
      return apiCall(endpoint, options, 1);
    }

    isRefreshing = true;
    lastRefreshAttempt = now;

    refreshPromise = (async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) throw new Error('No session to refresh');

        const { data: { session }, error } = await supabase.auth.refreshSession();
        if (error || !session?.access_token) throw new Error('Refresh failed');
        return session;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    try {
      await refreshPromise;
      return apiCall(endpoint, options, 1);
    } catch (e) {
      console.error('❌ Failed to refresh token:', e);
      await supabase.auth.signOut();
      redirectToLogin('Failed to refresh token');
    }
  }

  if (!res.ok) {
    console.error('❌ API Error:', { endpoint, status: res.status, error: res.data });
    const msg = res.data?.error || res.data?.message || `API error: ${res.status}`;
    throw new Error(msg);
  }

  return res.data;
}

// ===== FAMILIES & CHILDREN =====

export async function createFamily(name: string, parentIds: string[], timezone?: string) {
  return apiCall('/families', {
    method: 'POST',
    body: JSON.stringify({ name, parentIds, timezone }),
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
  resolverId: string,
  resolution?: string
) {
  return apiCall(`/edit-requests/${requestId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status, resolverId, resolution }),
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
  const existingItems = await getTrackableItems();
  if (existingItems?.length > 0) {
    console.log('⏭️ Skipping default data initialization - items already exist');
    return;
  }

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

  const existingProviders = await getProviders();
  if (!existingProviders || existingProviders.length === 0) {
    const providers = [
      { name: 'Quran Academy', ratePerClass: 25 },
      { name: 'Arabic Tutoring', ratePerClass: 30 },
    ];
    for (const p of providers) await createProvider(p);
    console.log('✅ Created default providers');
  }

  const existingMilestones = await getMilestones();
  if (!existingMilestones || existingMilestones.length === 0) {
    const milestones = [
      { points: 100, name: 'Bronze Achiever' },
      { points: 250, name: 'Silver Star' },
      { points: 500, name: 'Gold Champion' },
      { points: 1000, name: 'Diamond Leader' },
    ];
    for (const m of milestones) await createMilestone(m);
    console.log('✅ Created default milestones');
  }

  const existingRewards = await getRewards();
  if (!existingRewards || existingRewards.length === 0) {
    const rewards = [
      { name: 'Extra Screen Time (30min)', category: 'small', pointCost: 50 },
      { name: 'Ice Cream Outing', category: 'small', pointCost: 75 },
      { name: 'New Book', category: 'small', pointCost: 60 },
      { name: 'Lego Set', category: 'medium', pointCost: 200, description: 'Star Wars Lego' },
      { name: 'Theme Park Visit', category: 'large', pointCost: 500 },
      { name: 'Gaming Console', category: 'large', pointCost: 1000 },
    ];
    for (const r of rewards) await createReward(r);
    console.log('✅ Created default rewards');
  }

  console.log('✅ Default data initialization completed');
}

// Optional: convenience export
export const api = {
  createFamily,
  joinFamilyByCode,
  getFamily,
  generateInviteCode,
  createChild,
  getChildren,
  updateChild,

  checkSingleton,
  checkDedupe,
  logPointEvent,
  getChildEvents,

  createEditRequest,
  getEditRequests,
  resolveEditRequest,

  createAttendance,
  getChildAttendance,

  createProvider,
  getProviders,

  createTrackableItem,
  getTrackableItems,
  deduplicateTrackableItems,

  createMilestone,
  getMilestones,

  createReward,
  getRewards,

  createWishlistItem,
  getWishlists,
  updateWishlistStatus,
  convertWishlistToReward,
  deleteWishlist,

  initializeDefaultData,
};
