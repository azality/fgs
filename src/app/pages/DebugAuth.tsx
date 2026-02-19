import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { supabase } from '/utils/supabase/client';
import { projectId } from '/utils/supabase/info.tsx';

export function DebugAuth() {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const testSession = async () => {
    addLog('=== Testing Session ===');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      addLog(`❌ Error getting session: ${error.message}`);
      return;
    }
    
    if (!session) {
      addLog('❌ No session found');
      return;
    }
    
    addLog(`✅ Session found`);
    addLog(`User ID: ${session.user?.id}`);
    addLog(`Email: ${session.user?.email}`);
    addLog(`Token length: ${session.access_token?.length}`);
    addLog(`Token preview: ${session.access_token?.substring(0, 40)}...`);
    addLog(`Expires at: ${session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'}`);
    
    // Try to decode JWT
    try {
      const parts = session.access_token.split('.');
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));
      
      addLog(`JWT Header: ${JSON.stringify(header)}`);
      addLog(`JWT Payload: ${JSON.stringify({
        sub: payload.sub,
        email: payload.email,
        aud: payload.aud,
        role: payload.role,
        exp: payload.exp,
        exp_date: new Date(payload.exp * 1000).toISOString()
      })}`);
      
      if (payload.exp * 1000 < Date.now()) {
        addLog('❌ JWT IS EXPIRED!');
      } else {
        addLog('✅ JWT is valid (not expired)');
      }
    } catch (e) {
      addLog(`❌ Failed to decode JWT: ${e.message}`);
    }
  };

  const testApiCall = async () => {
    addLog('=== Testing API Call ===');
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      addLog('❌ No access token available');
      return;
    }
    
    addLog(`Sending request to /debug/auth-test`);
    addLog(`Token: ${session.access_token.substring(0, 40)}...`);
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/auth-test`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      addLog(`Response status: ${response.status}`);
      
      const text = await response.text();
      addLog(`Response body: ${text}`);
      
      if (response.ok) {
        addLog('✅ API call successful');
        const data = JSON.parse(text);
        addLog(`User info: ${JSON.stringify(data.user, null, 2)}`);
      } else {
        addLog('❌ API call failed');
      }
    } catch (error) {
      addLog(`❌ API call error: ${error.message}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Authentication Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={testSession}>Test Session</Button>
            <Button onClick={testApiCall}>Test API Call</Button>
            <Button onClick={clearLogs} variant="outline">Clear Logs</Button>
          </div>
          
          <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-xs overflow-auto max-h-96">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet. Click a button to start testing.</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))
            )}
          </div>
          
          <div className="text-sm text-gray-600 space-y-2">
            <p><strong>Instructions:</strong></p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Make sure you're logged in first (go to /onboarding and login)</li>
              <li>Click "Test Session" to check if your session is valid</li>
              <li>Click "Test API Call" to make a real API request</li>
              <li>Check the logs above AND your browser console for detailed output</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}