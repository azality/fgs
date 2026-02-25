import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { Child, PointEvent, AttendanceRecord } from '../data/mockData';
import {
  getChildren,
  getChildEvents,
  getChildAttendance,
  logPointEvent,
  createAttendance,
  updateChild,
  getFamily,
} from '../../utils/api';
import { AuthContext } from './AuthContext';
import { getCurrentRole } from '../utils/authHelpers';
import { supabase } from '../../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface Family {
  id: string;
  name: string;
  parentIds: string[];
  inviteCode?: string;
  createdAt: string;
  timezone?: string;
}

interface FamilyContextType {
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null) => void;
  children: Child[];
  pointEvents: PointEvent[];
  attendanceRecords: AttendanceRecord[];
  addPointEvent: (event: Omit<PointEvent, 'id' | 'timestamp'>) => Promise<void>;
  addAdjustment: (childId: string, points: number, reason: string) => Promise<void>;
  submitRecovery: (
    childId: string,
    negativeEventId: string,
    recoveryAction: 'apology' | 'reflection' | 'correction',
    recoveryNotes: string
  ) => Promise<void>;
  addAttendance: (record: Omit<AttendanceRecord, 'id' | 'timestamp'>) => Promise<void>;
  updateChildPoints: (childId: string, points: number) => Promise<void>;
  getCurrentChild: () => Child | undefined;
  familyId: string | null;
  family: Family | null;
  setFamilyId: (id: string) => void;
  loadFamilyData: () => Promise<void>;
  loading: boolean;
}

export const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children: reactChildren }: { children: ReactNode }) {
  const authContext = useContext(AuthContext);

  // Token selection (parent uses AuthContext, kid uses localStorage)
  const accessToken = (() => {
    const authToken = authContext?.accessToken;
    if (authToken) return authToken;

    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');

    if (userRole === 'child' || userMode === 'kid') {
      const kidToken =
        localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
      if (kidToken) {
        console.log('👶 FamilyContext: Using kid token from localStorage');
        return kidToken;
      }
    }

    return null;
  })();

  console.log('🏗️ FamilyProvider rendering:', {
    hasAuthContext: !!authContext,
    hasAccessToken: !!accessToken,
  });

  const [familyId, setFamilyIdState] = useState<string | null>(() => {
    const storedFamilyId = localStorage.getItem('fgs_family_id');
    console.log('🔍 FamilyContext: Initial familyId from localStorage:', storedFamilyId);
    return storedFamilyId;
  });

  const [family, setFamily] = useState<Family | null>(null);

  const setFamilyId = (id: string) => {
    console.log('FamilyContext - Setting familyId:', id);
    setFamilyIdState(id);
    localStorage.setItem('fgs_family_id', id);
  };

  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(() => {
    const currentRole = getCurrentRole();
    console.log('🔍 Initializing selectedChildId:', { currentRole });

    if (currentRole === 'child') {
      const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
      if (kidId) {
        console.log('✅ Kid mode - auto-selected child:', kidId);
        return kidId;
      }
    }

    if (currentRole === 'parent') {
      localStorage.removeItem('fgs_selected_child_id');
      console.log('✅ Parent mode - initialized selectedChildId to null');
      return null;
    }

    console.log('✅ Child/unknown mode - initialized selectedChildId to null');
    return null;
  });

  // Keep kid selection + ensure familyId is pulled after kid login
  useEffect(() => {
    const currentRole = getCurrentRole();

    if (currentRole === 'child') {
      const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');

      if (kidId && kidId !== selectedChildId) {
        console.log('👶 Kid logged in, auto-selecting child:', kidId);
        setSelectedChildIdState(kidId);
      }

      const storedFamilyId = localStorage.getItem('fgs_family_id');
      if (storedFamilyId && storedFamilyId !== familyId) {
        console.log('👶 Kid logged in, loading family ID from localStorage:', storedFamilyId);
        setFamilyIdState(storedFamilyId);
      } else if (!storedFamilyId) {
        console.error('❌ CRITICAL: Kid logged in but fgs_family_id is missing from localStorage!');
      }
    } else if (currentRole === 'parent') {
      console.log('👨‍👩‍👧‍👦 Switched to parent mode, clearing selectedChildId');
      setSelectedChildIdState(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const [children, setChildren] = useState<Child[]>([]);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const setSelectedChildId = (id: string | null) => {
    console.log('FamilyContext - Setting selectedChildId:', id);
    setSelectedChildIdState(id);

    if (id) localStorage.setItem('fgs_selected_child_id', id);
    else localStorage.removeItem('fgs_selected_child_id');
  };

  // Restore selection from localStorage (parent mode only)
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole === 'parent' && !selectedChildId && children.length > 0) {
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      if (storedChildId) {
        const childExists = children.some((c) => c.id === storedChildId);
        if (childExists) {
          console.log('✅ SEL-003: Restored child selection from localStorage:', storedChildId);
          setSelectedChildIdState(storedChildId);
        } else {
          console.log('⚠️ SEL-003: Stored child no longer exists, clearing localStorage');
          localStorage.removeItem('fgs_selected_child_id');
        }
      }
    }
  }, [children, selectedChildId]);

  // ✅ SEL-004: Handle 1→2+ children transition
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole === 'parent') {
      if (children.length >= 2 && selectedChildId) {
        const childExists = children.some((c) => c.id === selectedChildId);
        if (childExists) {
          console.log('✅ SEL-004: Keeping selection after 1→2+ transition:', selectedChildId);
        } else {
          console.log('⚠️ SEL-004: Current selection invalid, clearing');
          setSelectedChildIdState(null);
          localStorage.removeItem('fgs_selected_child_id');
        }
      }
    }
  }, [children.length, selectedChildId]);

  /**
   * ✅ DROP-IN FIX:
   * If simulator/device is a fresh install, localStorage won't have fgs_family_id.
   * After login, we must fetch "my family" using the current Supabase session token,
   * then set fgs_family_id so the rest of the app loads correctly.
   */
  const fetchMyFamilyFromBackend = useCallback(async (): Promise<Family | null> => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (error || !token) {
      console.error('❌ fetchMyFamilyFromBackend: no session/token', { error });
      return null;
    }

    // Your edge function base (matches what you used elsewhere)
    const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

    const res = await fetch(`${API_BASE}/family`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();
    console.log('👨‍👩‍👧‍👦 /family response:', { status: res.status, ok: res.ok, body: text });

    if (!res.ok) {
      // IMPORTANT: do not redirect here; let caller decide
      return null;
    }

    try {
      const parsed = JSON.parse(text);

      // Some backends return an array, some return a single object
      const fam = Array.isArray(parsed) ? parsed[0] : parsed;

      if (fam?.id) return fam as Family;

      return null;
    } catch (e) {
      console.error('❌ /family JSON parse failed', e);
      return null;
    }
  }, []);

  // Load family data from API
  const loadFamilyData = useCallback(async () => {
    console.log('🔄 loadFamilyData called:', {
      familyId,
      hasAccessToken: !!accessToken,
      accessTokenPreview: accessToken ? accessToken.substring(0, 30) + '...' : 'null',
    });

    if (!accessToken) {
      console.log('ℹ️ Skipping family data load - no access token (user not logged in yet)');
      return;
    }

    setLoading(true);
    try {
      // Always ensure we have a real Supabase session (fresh installs rely on this)
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      const sessionToken = session?.access_token;

      if (sessionErr || !sessionToken) {
        console.error('❌ Session missing/invalid in loadFamilyData:', sessionErr);
        return;
      }

      // ✅ If we don't have familyId yet (fresh install), fetch "my family" and set it
      let effectiveFamilyId = familyId;

      if (!effectiveFamilyId) {
        console.log('🧭 No familyId in localStorage/state. Fetching my family...');
        const myFamily = await fetchMyFamilyFromBackend();

        if (myFamily?.id) {
          console.log('✅ Found my family:', myFamily.id);
          effectiveFamilyId = myFamily.id;

          // Set state + localStorage so the rest of app behaves normally
          setFamilyIdState(myFamily.id);
          localStorage.setItem('fgs_family_id', myFamily.id);
          setFamily(myFamily);
        } else {
          console.log('⚠️ No family returned for this account. Routing to onboarding.');
          window.location.href = '/onboarding';
          return;
        }
      }

      // At this point we have a familyId for sure
      console.log('📡 Fetching family data for familyId:', effectiveFamilyId);
      const familyData = await getFamily(effectiveFamilyId);
      console.log('✅ Family data fetched:', familyData);
      setFamily(familyData);

      console.log('📡 Fetching children for familyId:', effectiveFamilyId);
      const childrenData = await getChildren(effectiveFamilyId);
      console.log('✅ Children fetched successfully:', childrenData.length, 'children');
      setChildren(childrenData);
    } catch (error: any) {
      console.error('❌ Error loading family data:', error);

      const errorMessage = error?.message || String(error);

      if (errorMessage.includes('Access denied') || errorMessage.includes('403')) {
        console.error('🚨 User does not have access to family:', familyId);

        localStorage.removeItem('fgs_family_id');
        localStorage.removeItem('fgs_selected_child_id');
        setFamilyIdState(null);
        setFamily(null);
        setChildren([]);

        const userRole = getCurrentRole();
        window.location.href = userRole === 'child' ? '/kid/login' : '/onboarding';
        return;
      }

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        console.error('🚨 Family does not exist:', familyId);

        localStorage.removeItem('fgs_family_id');
        localStorage.removeItem('fgs_selected_child_id');
        setFamilyIdState(null);
        setFamily(null);
        setChildren([]);

        window.location.href = '/onboarding';
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [familyId, accessToken, fetchMyFamilyFromBackend]);

  // Load child-specific data when child is selected
  useEffect(() => {
    if (!selectedChildId) return;
    if (!accessToken) return;

    const currentRole = getCurrentRole();

    console.log('🔍 Child data load check:', {
      selectedChildId,
      currentRole,
    });

    if (currentRole !== 'child') {
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      if (!storedChildId || storedChildId !== selectedChildId) {
        console.log('🚫 BLOCKING child data load - no explicit selection in parent mode', {
          selectedChildId,
          storedChildId,
          currentRole,
        });
        setSelectedChildIdState(null);
        return;
      }
    }

    const loadChildData = async () => {
      try {
        console.log('📊 Loading child data for:', selectedChildId);
        const [events, attendance] = await Promise.all([
          getChildEvents(selectedChildId),
          getChildAttendance(selectedChildId),
        ]);

        setPointEvents(events);
        setAttendanceRecords(attendance);
        console.log('✅ Child data loaded successfully');
      } catch (error) {
        console.error('❌ Error loading child data:', error);
        setSelectedChildIdState(null);
      }
    };

    loadChildData();
  }, [selectedChildId, accessToken]);

  // Load family data when familyId or accessToken changes
  useEffect(() => {
    console.log('🔄 FamilyContext useEffect triggered:', {
      familyId,
      hasAccessToken: !!accessToken,
    });

    // ✅ IMPORTANT: call loadFamilyData even when familyId is null (fresh install case)
    loadFamilyData();
  }, [familyId, accessToken, loadFamilyData]);

  const addPointEvent = async (event: Omit<PointEvent, 'id' | 'timestamp'>) => {
    try {
      const newEvent = await logPointEvent(event);
      setPointEvents((prev) => [newEvent, ...prev]);

      setChildren((prev) =>
        prev.map((child) => {
          if (child.id === event.childId) {
            const newPoints = child.currentPoints + event.points;
            return {
              ...child,
              currentPoints: newPoints,
              highestMilestone: Math.max(child.highestMilestone, newPoints),
            };
          }
          return child;
        })
      );
    } catch (error) {
      console.error('Error adding point event:', error);
      throw error;
    }
  };

  const addAdjustment = async (childId: string, points: number, reason: string) => {
    const adjustment = {
      childId,
      trackableItemId: 'adjustment',
      points,
      loggedBy: 'parent',
      isAdjustment: true,
      adjustmentReason: reason,
    };

    await addPointEvent(adjustment);
  };

  const submitRecovery = async (
    childId: string,
    negativeEventId: string,
    recoveryAction: 'apology' | 'reflection' | 'correction',
    recoveryNotes: string
  ) => {
    const recoveryPoints = {
      apology: 2,
      reflection: 3,
      correction: 5,
    };

    const recovery = {
      childId,
      trackableItemId: 'recovery',
      points: recoveryPoints[recoveryAction],
      loggedBy: 'child',
      isRecovery: true,
      recoveryFromEventId: negativeEventId,
      recoveryAction,
      recoveryNotes,
      notes: `Recovery: ${recoveryAction} - ${recoveryNotes}`,
    };

    await addPointEvent(recovery);
  };

  const updateChildPoints = async (childId: string, points: number) => {
    const child = children.find((c) => c.id === childId);
    if (!child) return;

    const newPoints = child.currentPoints + points;
    const newHighest = Math.max(child.highestMilestone, newPoints);

    try {
      await updateChild(childId, {
        currentPoints: newPoints,
        highestMilestone: newHighest,
      });

      setChildren((prev) =>
        prev.map((c) => (c.id === childId ? { ...c, currentPoints: newPoints, highestMilestone: newHighest } : c))
      );
    } catch (error) {
      console.error('Error updating child points:', error);
      throw error;
    }
  };

  const addAttendance = async (record: Omit<AttendanceRecord, 'id' | 'timestamp'>) => {
    try {
      const newRecord = await createAttendance(record);
      setAttendanceRecords((prev) => [newRecord, ...prev]);
    } catch (error) {
      console.error('Error adding attendance:', error);
      throw error;
    }
  };

  const getCurrentChild = () => {
    const child = children.find((c) => c.id === selectedChildId);

    if (!child && selectedChildId && !loading && children.length === 0) {
      console.warn('⚠️ getCurrentChild: Child not found after data load:', {
        selectedChildId,
        childrenCount: children.length,
        loading,
        allChildrenIds: children.map((c) => c.id),
      });
    }

    return child;
  };

  return (
    <FamilyContext.Provider
      value={{
        selectedChildId,
        setSelectedChildId,
        children,
        pointEvents,
        attendanceRecords,
        addPointEvent,
        addAdjustment,
        submitRecovery,
        addAttendance,
        updateChildPoints,
        getCurrentChild,
        familyId,
        family,
        setFamilyId,
        loadFamilyData,
        loading,
      }}
    >
      {reactChildren}
    </FamilyContext.Provider>
  );
}

export function useFamilyContext() {
  const context = useContext(FamilyContext);
  if (!context) throw new Error('useFamilyContext must be used within FamilyProvider');
  return context;
}

export const useFamily = useFamilyContext;
