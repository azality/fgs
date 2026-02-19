import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

export function SystemDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(false);

  const runDiagnostics = async () => {
    setRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // Test 1: Check localStorage
    try {
      const familyId = localStorage.getItem('fgs_family_id');
      if (familyId) {
        diagnostics.push({
          name: 'Family ID in localStorage',
          status: 'pass',
          message: 'Family ID found',
          details: familyId
        });
      } else {
        diagnostics.push({
          name: 'Family ID in localStorage',
          status: 'fail',
          message: 'No family ID found. A parent must log in first.',
          details: 'Available keys: ' + Object.keys(localStorage).join(', ')
        });
      }
    } catch (error) {
      diagnostics.push({
        name: 'Family ID in localStorage',
        status: 'fail',
        message: 'Error accessing localStorage',
        details: String(error)
      });
    }

    // Test 2: Check Supabase connection
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/health`,
        {
          headers: {
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        diagnostics.push({
          name: 'Supabase Backend Connection',
          status: 'pass',
          message: 'Backend is reachable',
          details: `Status: ${response.status}`
        });
      } else {
        diagnostics.push({
          name: 'Supabase Backend Connection',
          status: 'fail',
          message: 'Backend returned error',
          details: `Status: ${response.status}`
        });
      }
    } catch (error) {
      diagnostics.push({
        name: 'Supabase Backend Connection',
        status: 'fail',
        message: 'Cannot reach backend',
        details: String(error)
      });
    }

    // Test 3: Check if children can be loaded
    const familyId = localStorage.getItem('fgs_family_id');
    if (familyId) {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/children/public`,
          {
            headers: {
              'Content-Type': 'application/json',
              'apikey': publicAnonKey
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          diagnostics.push({
            name: 'Load Children',
            status: 'pass',
            message: `Found ${data.length} children`,
            details: data.map((c: any) => c.name).join(', ') || 'No children yet'
          });
        } else {
          const errorText = await response.text();
          diagnostics.push({
            name: 'Load Children',
            status: 'fail',
            message: 'Failed to load children',
            details: errorText
          });
        }
      } catch (error) {
        diagnostics.push({
          name: 'Load Children',
          status: 'fail',
          message: 'Error loading children',
          details: String(error)
        });
      }
    } else {
      diagnostics.push({
        name: 'Load Children',
        status: 'warning',
        message: 'Skipped (no family ID)',
        details: 'Cannot test without family ID'
      });
    }

    // Test 4: Check environment
    diagnostics.push({
      name: 'Environment Check',
      status: 'pass',
      message: 'Configuration loaded',
      details: `Project: ${projectId}, Key: ${publicAnonKey.substring(0, 20)}...`
    });

    // Test 5: Check current session
    const userRole = localStorage.getItem('user_role');
    const userId = localStorage.getItem('fgs_user_id');
    const userName = localStorage.getItem('fgs_user_name');
    const kidSessionToken = localStorage.getItem('kid_session_token');
    const selectedChildId = localStorage.getItem('selected_child_id');

    if (userRole || userId) {
      diagnostics.push({
        name: 'Current Session',
        status: 'pass',
        message: `Logged in as ${userRole || 'unknown'}`,
        details: `User: ${userName || 'N/A'}, ID: ${userId || 'N/A'}, Child: ${selectedChildId || 'N/A'}, Kid Token: ${kidSessionToken ? 'Yes' : 'No'}`
      });
    } else {
      diagnostics.push({
        name: 'Current Session',
        status: 'warning',
        message: 'No active session',
        details: 'Not logged in'
      });
    }

    setResults(diagnostics);
    setRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-6 w-6 text-green-600" />;
      case 'fail':
        return <XCircle className="h-6 w-6 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-6 w-6 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200';
      case 'fail':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>🔍 System Diagnostics</span>
              <Button
                onClick={runDiagnostics}
                disabled={running}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
                Run Again
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.length === 0 && running && (
              <p className="text-center text-gray-600 py-8">Running diagnostics...</p>
            )}

            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${getStatusColor(result.status)}`}
              >
                <div className="flex items-start gap-3">
                  {getIcon(result.status)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{result.name}</h3>
                    <p className="text-gray-700 mb-2">{result.message}</p>
                    {result.details && (
                      <p className="text-sm text-gray-600 font-mono bg-white p-2 rounded border">
                        {result.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Quick Actions */}
            <div className="mt-8 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-lg mb-4">Quick Fixes</h3>
              
              {results.some(r => r.name === 'Family ID in localStorage' && r.status === 'fail') && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Missing Family ID:</strong> A parent must log in at least once before kids can use PIN login.
                  </p>
                  <Button
                    onClick={() => window.location.href = '/parent-login'}
                    variant="default"
                  >
                    Go to Parent Login
                  </Button>
                </div>
              )}

              {results.some(r => r.name === 'Supabase Backend Connection' && r.status === 'fail') && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Backend Unreachable:</strong> Check your internet connection or Supabase deployment.
                  </p>
                </div>
              )}

              <div className="mt-4">
                <p className="text-sm text-gray-700 mb-2">View full system state:</p>
                <Button
                  onClick={() => window.location.href = '/debug-storage'}
                  variant="outline"
                >
                  Open Debug Storage
                </Button>
              </div>
            </div>

            {/* All localStorage Keys */}
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <h3 className="font-semibold mb-2">All localStorage Keys:</h3>
              <div className="text-sm font-mono">
                {Object.keys(localStorage).length === 0 ? (
                  <p className="text-gray-600">No keys in localStorage</p>
                ) : (
                  <ul className="space-y-1">
                    {Object.keys(localStorage).map(key => (
                      <li key={key} className="flex justify-between">
                        <span className="text-blue-600">{key}</span>
                        <span className="text-gray-600 truncate ml-4 max-w-xs">
                          {localStorage.getItem(key)?.substring(0, 50)}...
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
