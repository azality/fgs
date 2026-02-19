import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { supabase } from '/utils/supabase/client';
import { projectId } from '/utils/supabase/info.tsx';

interface TestResult {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  details?: any;
}

export function JWTDebugTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (result: TestResult) => {
    setResults(prev => [...prev, result]);
  };

  const runFullTest = async () => {
    setResults([]);
    setIsRunning(true);

    try {
      // Test 1: Check if user is logged in
      addResult({ name: 'Session Check', status: 'pending', message: 'Checking session...' });
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        addResult({ 
          name: 'Session Check', 
          status: 'error', 
          message: 'No active session. Please log in first.',
          details: sessionError
        });
        setIsRunning(false);
        return;
      }

      addResult({ 
        name: 'Session Check', 
        status: 'success', 
        message: `Session found for ${session.user?.email}`,
        details: {
          userId: session.user?.id,
          email: session.user?.email,
          tokenLength: session.access_token?.length,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'
        }
      });

      // Test 2: Decode JWT locally
      addResult({ name: 'JWT Decode', status: 'pending', message: 'Decoding JWT...' });
      
      try {
        const parts = session.access_token.split('.');
        const payload = JSON.parse(atob(parts[1]));
        
        const isExpired = payload.exp * 1000 < Date.now();
        
        addResult({ 
          name: 'JWT Decode', 
          status: isExpired ? 'error' : 'success', 
          message: isExpired ? 'JWT is expired!' : 'JWT decoded successfully',
          details: {
            sub: payload.sub,
            email: payload.email,
            exp: new Date(payload.exp * 1000).toISOString(),
            isExpired,
            minutesUntilExpiry: Math.round((payload.exp * 1000 - Date.now()) / 1000 / 60)
          }
        });

        if (isExpired) {
          addResult({ 
            name: 'Overall', 
            status: 'error', 
            message: 'Your session has expired. Please log in again.' 
          });
          setIsRunning(false);
          return;
        }
      } catch (e) {
        addResult({ 
          name: 'JWT Decode', 
          status: 'error', 
          message: `Failed to decode: ${e.message}` 
        });
      }

      // Test 3: Test backend JWT verification endpoint
      addResult({ name: 'Backend JWT Verification', status: 'pending', message: 'Testing JWT verification...' });
      
      try {
        const verifyResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/verify-jwt`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const verifyData = await verifyResponse.json();
        
        addResult({ 
          name: 'Backend JWT Verification', 
          status: verifyResponse.ok ? 'success' : 'error', 
          message: verifyResponse.ok ? 'Backend verified JWT successfully' : 'Backend failed to verify JWT',
          details: verifyData
        });
      } catch (e) {
        addResult({ 
          name: 'Backend JWT Verification', 
          status: 'error', 
          message: `Verification failed: ${e.message}` 
        });
      }

      // Test 4: Test actual authenticated endpoint
      addResult({ name: 'Auth Endpoint Test', status: 'pending', message: 'Testing authenticated endpoint...' });
      
      try {
        const authResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/auth-test`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const authData = await authResponse.json();
        
        addResult({ 
          name: 'Auth Endpoint Test', 
          status: authResponse.ok ? 'success' : 'error', 
          message: authResponse.ok ? 'Authentication middleware passed!' : 'Authentication middleware failed',
          details: authData
        });

        // Final summary
        if (authResponse.ok) {
          addResult({ 
            name: '✅ Overall Result', 
            status: 'success', 
            message: '🎉 All JWT authentication tests passed! Your authentication is working correctly.',
            details: { timestamp: new Date().toISOString() }
          });
        } else {
          addResult({ 
            name: '❌ Overall Result', 
            status: 'error', 
            message: 'JWT authentication failed. See details above.',
            details: authData
          });
        }
      } catch (e) {
        addResult({ 
          name: 'Auth Endpoint Test', 
          status: 'error', 
          message: `Request failed: ${e.message}` 
        });
      }

    } catch (error) {
      addResult({ 
        name: 'Test Suite', 
        status: 'error', 
        message: `Unexpected error: ${error.message}` 
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'pending': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'pending': return '⏳';
      default: return '•';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>JWT Authentication Debug Test</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            This tool runs a comprehensive test of JWT authentication between the frontend and backend.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-4">
            <Button 
              onClick={runFullTest} 
              disabled={isRunning}
              size="lg"
            >
              {isRunning ? 'Running Tests...' : 'Run Full Test Suite'}
            </Button>
            
            <Button 
              onClick={() => setResults([])} 
              variant="outline"
              disabled={isRunning}
            >
              Clear Results
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Test Results:</h3>
              
              <div className="space-y-3">
                {results.map((result, index) => (
                  <Card key={index} className="border-l-4" style={{
                    borderLeftColor: result.status === 'success' ? '#16a34a' : 
                                    result.status === 'error' ? '#dc2626' : 
                                    '#ca8a04'
                  }}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{getStatusIcon(result.status)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{result.name}</span>
                            <span className={`text-sm ${getStatusColor(result.status)}`}>
                              {result.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{result.message}</p>
                          
                          {result.details && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                                Show details
                              </summary>
                              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-64">
                                {JSON.stringify(result.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {results.length === 0 && !isRunning && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No test results yet</p>
              <p className="text-sm">Click "Run Full Test Suite" to start testing your JWT authentication</p>
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm">
            <p className="font-semibold mb-2">Test Sequence:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li>Verify you have an active session</li>
              <li>Decode the JWT locally to check expiration</li>
              <li>Send JWT to backend verification endpoint</li>
              <li>Test actual authenticated API endpoint</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
