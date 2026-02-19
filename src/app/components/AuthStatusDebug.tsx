import { useContext, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { clearAuthAndReload } from '../utils/auth-helper';
import { Button } from './ui/button';
import { projectId } from '/utils/supabase/info';

export function AuthStatusDebug() {
  const authContext = useContext(AuthContext);
  const [debugResult, setDebugResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // If AuthProvider not ready yet, return null
  if (!authContext) {
    return null;
  }

  const { accessToken, userId } = authContext;

  const testJWT = async () => {
    if (!accessToken) {
      setDebugResult({ error: 'No access token available' });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/verify-jwt`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();
      setDebugResult({ jwtVerify: result });
      console.log('JWT Debug Result:', result);
    } catch (error) {
      setDebugResult({ error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const testMiddleware = async () => {
    if (!accessToken) {
      setDebugResult({ error: 'No access token available' });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/test-middleware`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();
      setDebugResult({ middleware: result, status: response.status });
      console.log('Middleware Test Result:', result);
    } catch (error) {
      setDebugResult({ error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const testHeaders = async () => {
    if (!accessToken) {
      setDebugResult({ error: 'No access token available' });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/headers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();
      setDebugResult({ headers: result });
      console.log('Headers Test Result:', result);
    } catch (error) {
      setDebugResult({ error: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-md z-50">
      <h3 className="font-bold text-sm mb-2">🔐 Auth Status (Dev Only)</h3>
      <div className="text-xs space-y-1">
        <div>
          <strong>User ID:</strong> {userId || 'None'}
        </div>
        <div>
          <strong>Has Token:</strong> {accessToken ? 'Yes' : 'No'}
        </div>
        {accessToken && (
          <div>
            <strong>Token:</strong> {accessToken.substring(0, 20)}...{accessToken.substring(accessToken.length - 10)}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Button 
            onClick={testJWT}
            disabled={!accessToken || testing}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {testing ? 'Testing...' : 'Test JWT'}
          </Button>
          <Button 
            onClick={testMiddleware}
            disabled={!accessToken || testing}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {testing ? 'Testing...' : 'Test Middleware'}
          </Button>
          <Button 
            onClick={testHeaders}
            disabled={!accessToken || testing}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {testing ? 'Testing...' : 'Test Headers'}
          </Button>
          <Button 
            onClick={clearAuthAndReload}
            variant="destructive"
            size="sm"
            className="text-xs"
          >
            Clear Auth
          </Button>
        </div>
        {debugResult && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
            <strong>Debug Result:</strong>
            <pre>{JSON.stringify(debugResult, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}