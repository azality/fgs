import { supabase } from '/utils/supabase/client';

/**
 * Clear all authentication data and force a fresh login
 */
export async function clearAuthAndReload() {
  console.log('🧹 Clearing all auth data and reloading...');
  
  // Sign out from Supabase
  await supabase.auth.signOut();
  
  // Clear localStorage items
  localStorage.removeItem('fgs_user_id');
  localStorage.removeItem('fgs_family_id');
  localStorage.removeItem('fgs_user_mode');
  
  // Clear any Supabase session data from localStorage
  const supabaseKeys = Object.keys(localStorage).filter(key => 
    key.startsWith('sb-') || key.includes('supabase')
  );
  supabaseKeys.forEach(key => localStorage.removeItem(key));
  
  console.log('✅ Auth data cleared. Reloading page...');
  
  // Reload the page to start fresh
  window.location.href = '/login';
}

/**
 * Check if the current session is valid
 */
export async function validateSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Session validation error:', error);
      return false;
    }
    
    if (!session) {
      console.log('No active session found');
      return false;
    }
    
    // Check if token is expired
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);
    
    if (expiresAt < now) {
      console.log('Session expired');
      return false;
    }
    
    console.log('✅ Session is valid');
    return true;
  } catch (error) {
    console.error('Error validating session:', error);
    return false;
  }
}