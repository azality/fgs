import { useEffect, useState, useContext } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { AuthContext } from '../contexts/AuthContext';

export function SessionDebug() {
  // CRITICAL: ALL hooks must be called before any conditional returns
  const authContext = useContext(AuthContext);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      setSessionInfo({
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        isExpired: session?.expires_at ? session.expires_at * 1000 < Date.now() : null,
        tokenLength: session?.access_token?.length,
        error: error?.message
      });
    };

    checkSession();
    const interval = setInterval(checkSession, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Now safe to return null if AuthProvider not ready yet
  if (!authContext) {
    return null;
  }

  const { accessToken, userId } = authContext;

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-black/90 text-white px-3 py-2 rounded-lg text-xs z-50"
      >
        🔐 Show Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold">🔐 Session Debug</div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-white/70 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1">
        <div>Context Token: {accessToken ? '✅' : '❌'}</div>
        <div>Context UserId: {userId || 'none'}</div>
        <div>Supabase Session: {sessionInfo?.hasSession ? '✅' : '❌'}</div>
        <div>Session UserId: {sessionInfo?.userId || 'none'}</div>
        <div>Session Email: {sessionInfo?.email || 'none'}</div>
        <div>Token Length: {sessionInfo?.tokenLength || 0}</div>
        <div>Expires: {sessionInfo?.expiresAt?.substring(11, 19) || 'none'}</div>
        <div>Is Expired: {sessionInfo?.isExpired ? '⚠️ YES' : '✅ NO'}</div>
        {sessionInfo?.error && <div className="text-red-400">Error: {sessionInfo.error}</div>}
      </div>
    </div>
  );
}