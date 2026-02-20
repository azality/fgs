// CRITICAL: Import session cleanup FIRST before any Supabase imports
import '../utils/sessionCleanup';

import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { FamilyProvider } from './contexts/FamilyContext';
import { AuthProvider } from './contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from './contexts/ViewModeContext';
import { Toaster } from './components/ui/sonner';
import { SessionDebug } from './components/SessionDebug';
import { AuthStatusDebug } from './components/AuthStatusDebug';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from '../../utils/supabase/client';
import { useState, useEffect } from 'react';

// Clean up any corrupted Supabase sessions on app start
async function cleanupCorruptedSessions() {
  try {
    // CRITICAL: Check if user is in kid mode FIRST - don't clean kid sessions!
    const userRole = localStorage.getItem('user_role');
    if (userRole === 'child') {
      console.log('👶 Kid mode detected in App.tsx - skipping session cleanup to preserve kid session');
      return false;
    }
    
    // Check all localStorage keys related to Supabase
    const keys = Object.keys(localStorage);
    const supabaseKeys = keys.filter(k => k.includes('sb-') || k.includes('supabase'));
    
    let foundCorruption = false;
    
    for (const key of supabaseKeys) {
      const value = localStorage.getItem(key);
      
      // Check if any Supabase keys contain the string "null" as token
      if (value && (value.includes('"access_token":"null"') || value.includes('"access_token":null'))) {
        console.error('❌ Found corrupted Supabase session in', key);
        foundCorruption = true;
      }
    }
    
    if (foundCorruption) {
      console.log('🧹 Clearing all corrupted Supabase sessions');
      // Force Supabase to sign out (clears in-memory session)
      await supabase.auth.signOut();
      // Clear all localStorage
      supabaseKeys.forEach(key => localStorage.removeItem(key));
      localStorage.clear();
      window.location.href = '/parent-login';
      return true; // Return true to signal that we redirected
    }
    
    return false; // No corruption found
  } catch (error) {
    console.error('Error during session cleanup:', error);
    return false;
  }
}

export default function App() {
  const [isCleanupDone, setIsCleanupDone] = useState(false);
  
  useEffect(() => {
    // Additional async cleanup check (for cases caught after initial module load)
    cleanupCorruptedSessions().then((wasCorrupted) => {
      if (!wasCorrupted) {
        // Only mark as done if we didn't redirect
        setIsCleanupDone(true);
      }
    });
  }, []);
  
  // Show loading while cleanup is running
  if (!isCleanupDone) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
        <SessionDebug />
        <AuthStatusDebug />
      </AuthProvider>
    </ErrorBoundary>
  );
}