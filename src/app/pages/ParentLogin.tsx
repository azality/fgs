import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Users, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../utils/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { setParentSession } from '../utils/authHelpers';
import { isPushNotificationsSupported, initializePushNotifications } from '../utils/pushNotifications';

export function ParentLogin() {
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('🔐 Starting parent login process for:', email);
      
      // CRITICAL: Clear any stale kid session data BEFORE login
      // This prevents race conditions where FamilyContext tries to use old child data
      console.log('🧹 Pre-login cleanup: Clearing stale kid session data');
      localStorage.removeItem('child_id');
      localStorage.removeItem('fgs_selected_child_id');
      localStorage.removeItem('selected_child_id');
      localStorage.removeItem('last_active_child');
      localStorage.removeItem('kid_pin_session');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('❌ Login error from Supabase:', error);
        throw error;
      }

      console.log('✅ Login successful:', {
        userId: data.user?.id,
        email: data.user?.email,
        hasSession: !!data.session,
        hasAccessToken: !!data.session?.access_token
      });

      // Use the centralized helper to set parent session
      // This will clear any kid session data and set parent role
      setParentSession(
        data.user.id,
        data.user.user_metadata.name || email,
        email
      );
      
      // CRITICAL: Wait a bit for Supabase to persist the session to localStorage
      console.log('⏳ Waiting for session persistence...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // CRITICAL: Refresh the session in AuthContext to ensure it has the latest token
      // This prevents race conditions where FamilyContext tries to load before session is ready
      console.log('🔄 Refreshing AuthContext session...');
      await refreshSession();
      
      // Double-check that we have a valid session before proceeding
      const { data: { session: verifySession } } = await supabase.auth.getSession();
      console.log('✅ Session verification:', {
        hasSession: !!verifySession,
        hasToken: !!verifySession?.access_token,
        tokenLength: verifySession?.access_token?.length
      });
      
      if (!verifySession?.access_token) {
        throw new Error('Session was not properly established. Please try again.');
      }
      
      console.log('✅ AuthContext session refreshed and verified');
      
      // CRITICAL FIX: Fetch and cache family ID from backend
      console.log('🔍 Fetching user\'s family from backend...');
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;
        const familiesResponse = await fetch(`${API_BASE}/families`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${verifySession.access_token}`,
            'Content-Type': 'application/json',
            'apikey': publicAnonKey,
          },
        });

        if (familiesResponse.ok) {
          const families = await familiesResponse.json();
          console.log('✅ Families from backend:', families);
          
          if (families && families.length > 0) {
            const familyId = families[0].id;
            localStorage.setItem('fgs_family_id', familyId);
            console.log('✅ Cached family ID:', familyId);
            
            // Small delay to ensure localStorage is flushed before navigation
            await new Promise(resolve => setTimeout(resolve, 100));
            
            toast.success('Welcome back!');
            
            // Initialize push notifications (non-blocking)
            if (isPushNotificationsSupported()) {
              try {
                console.log('📬 Initializing push notifications...');
                await initializePushNotifications(data.user.id);
                console.log('✅ Push notifications initialized');
              } catch (pushError) {
                // Non-blocking - don't prevent login if push fails
                console.warn('⚠️ Failed to initialize push notifications:', pushError);
              }
            }
            
            navigate('/');
            return;
          } else {
            console.warn('⚠️ No families found for user - redirecting to onboarding');
            toast.info('Please complete family setup');
            await new Promise(resolve => setTimeout(resolve, 100));
            navigate('/onboarding');
            return;
          }
        } else {
          const errorText = await familiesResponse.text();
          console.error('❌ Failed to fetch families:', {
            status: familiesResponse.status,
            error: errorText
          });
        }
      } catch (fetchError) {
        console.error('❌ Error fetching families:', fetchError);
      }
      
      // If we get here, something went wrong but user is authenticated
      // Redirect to onboarding to be safe
      toast.info('Please complete family setup');
      await new Promise(resolve => setTimeout(resolve, 100));
      navigate('/onboarding');
    } catch (error: any) {
      console.error('❌ Login error:', error);
      toast.error(error.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-4 rounded-full">
              <Users className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Parent Login</CardTitle>
          <CardDescription>
            Sign in to manage your family
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 space-y-4">
            <div className="text-center text-sm">
              <span className="text-gray-600">Don't have an account? </span>
              <button
                onClick={() => navigate('/signup')}
                className="text-blue-600 hover:underline font-medium"
              >
                Sign up
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate('/kid-login')}
              className="w-full"
            >
              <span className="text-2xl mr-2">👶</span>
              Kid Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}