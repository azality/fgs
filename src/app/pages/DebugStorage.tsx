import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '/utils/supabase/client';

interface StorageItem {
  key: string;
  value: string;
  isFGS: boolean;
}

export function DebugStorage() {
  const navigate = useNavigate();
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadData = async () => {
    // Load localStorage items
    const items: StorageItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        items.push({
          key,
          value,
          isFGS: key.startsWith('fgs_') || key.includes('supabase')
        });
      }
    }
    setStorageItems(items);

    // Load session info
    const { data: { session } } = await supabase.auth.getSession();
    setSessionInfo(session);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
    toast.success('Data refreshed');
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear ALL localStorage? This will log you out.')) {
      localStorage.clear();
      toast.success('localStorage cleared');
      loadData();
    }
  };

  const handleClearItem = (key: string) => {
    if (confirm(`Clear "${key}"?`)) {
      localStorage.removeItem(key);
      toast.success(`Cleared ${key}`);
      loadData();
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(null), 2000);
  };

  const fgsItems = storageItems.filter(item => item.isFGS);
  const otherItems = storageItems.filter(item => !item.isFGS);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">Debug Storage</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Session Info */}
        <Card>
          <CardHeader>
            <CardTitle>Session Information</CardTitle>
            <CardDescription>Current Supabase authentication session</CardDescription>
          </CardHeader>
          <CardContent>
            {sessionInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-600">User ID</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm break-all">{sessionInfo.user.id}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(sessionInfo.user.id, 'userId')}
                      >
                        {copied === 'userId' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Email</p>
                    <p className="text-sm">{sessionInfo.user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Expires At</p>
                    <p className="text-sm">{new Date(sessionInfo.expires_at * 1000).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Token Length</p>
                    <p className="text-sm">{sessionInfo.access_token.length} characters</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-2">Access Token (first 100 chars)</p>
                  <div className="flex items-start gap-2">
                    <p className="font-mono text-xs bg-gray-100 p-2 rounded break-all flex-1">
                      {sessionInfo.access_token.substring(0, 100)}...
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(sessionInfo.access_token, 'token')}
                    >
                      {copied === 'token' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No active session</p>
            )}
          </CardContent>
        </Card>

        {/* FGS-Related Items */}
        <Card>
          <CardHeader>
            <CardTitle>FGS Data ({fgsItems.length} items)</CardTitle>
            <CardDescription>Family Growth System specific data</CardDescription>
          </CardHeader>
          <CardContent>
            {fgsItems.length > 0 ? (
              <div className="space-y-4">
                {fgsItems.map((item) => (
                  <div key={item.key} className="border rounded-lg p-4 bg-blue-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-semibold text-sm text-blue-900">{item.key}</p>
                          {item.key === 'fgs_family_id' && (
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                              CRITICAL
                            </span>
                          )}
                        </div>
                        <div className="flex items-start gap-2">
                          <p className="font-mono text-xs bg-white p-2 rounded break-all flex-1">
                            {item.value.length > 200 ? item.value.substring(0, 200) + '...' : item.value}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(item.value, item.key)}
                          >
                            {copied === item.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Length: {item.value.length} characters</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClearItem(item.key)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-red-600 font-semibold mb-2">⚠️ No FGS data found!</p>
                <p className="text-gray-600 text-sm mb-4">
                  You haven't completed onboarding yet. Please complete the parent onboarding flow.
                </p>
                <Button onClick={() => navigate('/onboarding')}>
                  Go to Onboarding
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Other Items */}
        {otherItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Other localStorage Items ({otherItems.length})</CardTitle>
              <CardDescription>Non-FGS data stored in localStorage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {otherItems.map((item) => (
                  <div key={item.key} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm mb-1">{item.key}</p>
                        <p className="font-mono text-xs text-gray-600 break-all">
                          {item.value.length > 100 ? item.value.substring(0, 100) + '...' : item.value}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClearItem(item.key)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common debugging tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                console.log('=== FGS DEBUG INFO ===');
                console.log('localStorage:', localStorage);
                console.log('fgs_family_id:', localStorage.getItem('fgs_family_id'));
                console.log('fgs_kid_session:', localStorage.getItem('fgs_kid_session'));
                console.log('Session:', sessionInfo);
                toast.success('Debug info logged to console');
              }}
            >
              📋 Log Debug Info to Console
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/onboarding')}
            >
              🚀 Go to Onboarding
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/kid-login')}
            >
              👶 Try Kid Login
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/login')}
            >
              👨‍👩‍👧‍👦 Parent Login
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">💡 What to Look For</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-blue-900">
            <div>
              <p className="font-semibold">✅ If everything is working:</p>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li><code className="bg-blue-100 px-1 rounded">fgs_family_id</code> should contain a UUID</li>
                <li>Session should show your user email and a valid token</li>
                <li>Kid Login should work after completing onboarding</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">❌ If Kid Login shows "No family found":</p>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li><code className="bg-blue-100 px-1 rounded">fgs_family_id</code> will be missing</li>
                <li>You need to complete parent onboarding first</li>
                <li>Go to "Parent Login" → Sign up → Create family → Add children</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
