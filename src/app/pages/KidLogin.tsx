import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, Delete } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { motion } from 'motion/react';
import { setKidSession } from '../utils/authHelpers';

interface Child {
  id: string;
  name: string;
  avatar: string;
  familyId: string;
}

export function KidLogin() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      // Get family ID from localStorage
      const familyId = localStorage.getItem('fgs_family_id');
      
      console.log('🔍 KidLogin - Loading children:', { 
        hasFamilyId: !!familyId, 
        familyId 
      });
      
      if (!familyId) {
        toast.error('No family found. Please ask a parent to complete onboarding first.', {
          duration: 5000
        });
        navigate('/');
        return;
      }

      // Use the public endpoint that doesn't require authentication
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
        console.log('✅ Children loaded:', data);
        
        if (data.length === 0) {
          toast.error('No children found. Please ask a parent to add you first.', {
            duration: 5000
          });
          navigate('/');
          return;
        }
        
        setChildren(data);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to load children:', errorText);
        toast.error('Failed to load children. Please try again.');
        navigate('/');
      }
    } catch (error) {
      console.error('❌ Error loading children:', error);
      toast.error('Failed to load children. Please try again.');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      setPin(pin + digit);
    }
  };

  const handlePinDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const handlePinSubmit = async () => {
    if (pin.length !== 4 || !selectedChild) return;

    setVerifying(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${selectedChild.id}/verify-pin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pin })
        }
      );

      const data = await response.json();

      if (data.success) {
        // Store the kid session token - CRITICAL for API authentication
        if (data.kidSessionToken) {
          localStorage.setItem('kid_session_token', data.kidSessionToken);
          console.log('✅ Kid session token stored');
        }
        
        // Store session using centralized helper
        setKidSession(selectedChild.id, selectedChild.name, selectedChild.familyId);

        toast.success(`Welcome back, ${selectedChild.name}! 🌟`);
        navigate('/');
      } else {
        toast.error('Incorrect PIN. Try again!');
        setPin('');
      }
    } catch (error) {
      toast.error('Something went wrong. Try again!');
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      handlePinSubmit();
    }
  }, [pin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#FFE5CC]">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  if (!selectedChild) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#FFE5CC] px-4 py-8">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="absolute top-4 left-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="text-6xl mb-4">👶</div>
            <CardTitle className="text-3xl">Who's using the app?</CardTitle>
            <CardDescription className="text-lg">Tap your picture!</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {children.map((child) => (
                <motion.button
                  key={child.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedChild(child)}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border-4 border-transparent hover:border-[#F4C430] bg-white shadow-lg transition-all"
                >
                  <div className="text-6xl">{child.avatar}</div>
                  <p className="font-bold text-lg">{child.name}</p>
                </motion.button>
              ))}
            </div>

            {children.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">
                  No kids added yet!
                </p>
                <Button onClick={() => navigate('/login')}>
                  Parent Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#FFE5CC] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedChild(null);
              setPin('');
            }}
            className="absolute top-4 left-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="text-6xl mb-2">{selectedChild.avatar}</div>
          <CardTitle className="text-2xl">Hi, {selectedChild.name}!</CardTitle>
          <CardDescription className="text-lg">Enter your PIN</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PIN Display */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-14 h-14 rounded-xl border-4 border-gray-300 flex items-center justify-center text-2xl font-bold bg-white"
              >
                {pin[i] ? '•' : ''}
              </div>
            ))}
          </div>

          {/* Number Pad */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <motion.button
                key={num}
                whileTap={{ scale: 0.9 }}
                onClick={() => handlePinInput(num.toString())}
                className="h-16 rounded-xl bg-[#F4C430] text-white text-2xl font-bold shadow-lg hover:bg-[#E5B420] transition-colors"
                disabled={verifying}
              >
                {num}
              </motion.button>
            ))}
            <div></div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => handlePinInput('0')}
              className="h-16 rounded-xl bg-[#F4C430] text-white text-2xl font-bold shadow-lg hover:bg-[#E5B420] transition-colors"
              disabled={verifying}
            >
              0
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handlePinDelete}
              className="h-16 rounded-xl bg-gray-300 text-gray-700 flex items-center justify-center shadow-lg hover:bg-gray-400 transition-colors"
              disabled={verifying}
            >
              <Delete className="h-6 w-6" />
            </motion.button>
          </div>

          {verifying && (
            <p className="text-center text-gray-600">Checking PIN...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}