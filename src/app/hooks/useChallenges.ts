import { useState, useEffect } from 'react';
import { Challenge } from '../data/mockData';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '/utils/supabase/info';

export function useChallenges() {
  const { getCurrentChild } = useFamilyContext();
  const { accessToken: authToken } = useAuth();
  const child = getCurrentChild();
  
  // CRITICAL: Support kid mode tokens from localStorage
  const accessToken = (() => {
    if (authToken) return authToken;
    
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    
    if (userRole === 'child' || userMode === 'kid') {
      return localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
    }
    
    return null;
  })();
  
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (child && accessToken) {
      loadChallenges();
    }
  }, [child?.id, accessToken]); // Also depend on accessToken

  const loadChallenges = async () => {
    if (!child || !accessToken) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/challenges`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}` // Use user's access token
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setChallenges(data);
      } else {
        console.error('Failed to load challenges:', response.status);
        setChallenges([]);
      }
    } catch (error) {
      console.error('Error loading challenges:', error);
      setChallenges([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    challenges,
    loading,
    refetch: loadChallenges
  };
}