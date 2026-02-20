import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Child, PointEvent, AttendanceRecord } from '../data/mockData';
import { 
  getChildren, 
  getChildEvents, 
  getChildAttendance, 
  logPointEvent, 
  createAttendance,
  updateChild,
  getFamily
} from '../../utils/api';
import { AuthContext } from './AuthContext';
import { getCurrentRole } from '../utils/authHelpers';

interface Family {
  id: string;
  name: string;
  parentIds: string[];
  inviteCode?: string;
  createdAt: string;
}

interface FamilyContextType {
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null) => void;
  children: Child[];
  pointEvents: PointEvent[];
  attendanceRecords: AttendanceRecord[];
  addPointEvent: (event: Omit<PointEvent, 'id' | 'timestamp'>) => Promise<void>;
  addAdjustment: (childId: string, points: number, reason: string) => Promise<void>;
  submitRecovery: (childId: string, negativeEventId: string, recoveryAction: 'apology' | 'reflection' | 'correction', recoveryNotes: string) => Promise<void>;
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
  // Safely access auth context
  const authContext = useContext(AuthContext);
  
  // CRITICAL: In kid mode, get token from localStorage instead of AuthContext
  const accessToken = (() => {
    const authToken = authContext?.accessToken;
    if (authToken) return authToken;
    
    // Check if we're in kid mode
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    
    if (userRole === 'child' || userMode === 'kid') {
      const kidToken = localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
      if (kidToken) {
        console.log('👶 FamilyContext: Using kid token from localStorage');
        return kidToken;
      }
    }
    
    return null;
  })();

  console.log('🏗️ FamilyProvider rendering:', { 
    hasAuthContext: !!authContext, 
    hasAccessToken: !!accessToken 
  });

  const [familyId, setFamilyIdState] = useState<string | null>(() => {
    // Try to load from localStorage
    return localStorage.getItem('fgs_family_id');
  });
  
  const [family, setFamily] = useState<Family | null>(null);
  
  const setFamilyId = (id: string) => {
    console.log('FamilyContext - Setting familyId:', id);
    setFamilyIdState(id);
    localStorage.setItem('fgs_family_id', id);
  };
  
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(() => {
    // CRITICAL: Check if we're in kid mode first
    const currentRole = getCurrentRole();
    console.log('🔍 Initializing selectedChildId:', { currentRole });
    
    if (currentRole === 'child') {
      // In kid mode, auto-select the logged-in kid
      const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
      if (kidId) {
        console.log('✅ Kid mode - auto-selected child:', kidId);
        return kidId;
      }
    }
    
    if (currentRole === 'parent') {
      // Clear any stale selection from localStorage
      localStorage.removeItem('fgs_selected_child_id');
      console.log('✅ Parent mode - initialized selectedChildId to null');
      return null;
    }
    
    // In child/unknown mode, could load from localStorage if needed
    console.log('✅ Child/unknown mode - initialized selectedChildId to null');
    return null;
  });
  const [children, setChildren] = useState<Child[]>([]);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Wrapper for setSelectedChildId that also clears when switching to parent mode
  const setSelectedChildId = (id: string | null) => {
    console.log('FamilyContext - Setting selectedChildId:', id);
    setSelectedChildIdState(id);
    
    // Update localStorage to track explicit parent selections
    if (id) {
      localStorage.setItem('fgs_selected_child_id', id);
    } else {
      localStorage.removeItem('fgs_selected_child_id');
    }
  };

  // Clear selected child when role changes to parent
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole === 'parent') {
      console.log('🔄 Parent mode detected - clearing selected child');
      setSelectedChildIdState(null);
      // Also clear from localStorage
      localStorage.removeItem('fgs_selected_child_id');
    }
  }, [accessToken]); // Re-run when token changes (i.e., after login)
  
  // CRITICAL: Force-clear selectedChildId on mount if parent mode
  useEffect(() => {
    const currentRole = getCurrentRole();
    console.log('🔍 FamilyContext mount check:', {
      currentRole,
      selectedChildId,
      willClear: currentRole === 'parent' && selectedChildId !== null
    });
    
    if (currentRole === 'parent' && selectedChildId !== null) {
      console.log('🚨 Force-clearing selectedChildId on mount (parent mode)');
      setSelectedChildIdState(null);
      localStorage.removeItem('fgs_selected_child_id');
    }
  }, []); // Run once on mount

  // Load family data from API
  const loadFamilyData = useCallback(async () => {
    console.log('🔄 loadFamilyData called:', { 
      familyId, 
      hasAccessToken: !!accessToken,
      accessTokenPreview: accessToken ? accessToken.substring(0, 30) + '...' : 'null'
    });
    
    if (!familyId) {
      console.warn('⚠️ Cannot load family data - familyId is missing');
      return;
    }
    
    // Don't try to load data if we don't have an access token
    if (!accessToken) {
      console.warn('⚠️ Cannot load family data - no access token');
      return;
    }

    setLoading(true);
    try {
      // Fetch family data (includes invite code)
      console.log('📡 Fetching family data for familyId:', familyId);
      const familyData = await getFamily(familyId);
      console.log('✅ Family data fetched:', familyData);
      setFamily(familyData);
      
      console.log('📡 Fetching children for familyId:', familyId);
      const childrenData = await getChildren(familyId);
      console.log('✅ Children fetched successfully:', childrenData.length, 'children');
      setChildren(childrenData);
      
      // Auto-select first child ONLY in kid mode
      // In parent mode, let parents explicitly select which child to view
      const currentRole = getCurrentRole();
      const isKidMode = currentRole === 'child';
      
      console.log('📋 Family data loaded - checking auto-select:', {
        childCount: childrenData.length,
        hasSelectedChild: !!selectedChildId,
        currentRole,
        isKidMode
      });
      
      // CRITICAL: Only auto-select in kid mode
      // In parent mode, we never auto-select to prevent unauthorized data loading
      if (childrenData.length > 0 && !selectedChildId && isKidMode) {
        // In kid mode, auto-select the logged-in child
        const kidChildId = localStorage.getItem('child_id');
        if (kidChildId && childrenData.some(c => c.id === kidChildId)) {
          console.log('Auto-selecting logged-in child:', kidChildId);
          setSelectedChildId(kidChildId);
        } else {
          // Fallback to first child if kid's ID not found
          console.log('Auto-selecting first child as fallback');
          setSelectedChildId(childrenData[0].id);
        }
      } else if (!isKidMode && childrenData.length === 1 && !selectedChildId) {
        // NEW: In parent mode, if there's only one child, auto-select for convenience
        console.log('✅ Parent mode with single child - auto-selecting:', childrenData[0].name);
        setSelectedChildId(childrenData[0].id);
      } else if (!isKidMode) {
        console.log('⚠️ Parent mode detected - NOT auto-selecting child');
        // Ensure selectedChildId is cleared in parent mode
        if (selectedChildId) {
          console.log('⚠️ Clearing stale selectedChildId in parent mode');
          setSelectedChildIdState(null);
        }
      }
      
      console.log('Family data loaded:', {
        childCount: childrenData.length,
        selectedChildId,
        currentRole,
        isKidMode
      });
    } catch (error) {
      console.error('Error loading family data:', error);
    } finally {
      setLoading(false);
    }
  }, [familyId, accessToken]); // Removed selectedChildId from dependencies to avoid infinite loop

  // Load child-specific data when child is selected
  useEffect(() => {
    if (!selectedChildId) return;
    if (!accessToken) return; // Don't load without token

    // CRITICAL: Immediate role check - bail out if parent mode without explicit selection
    // This must happen BEFORE any other checks to prevent race conditions
    const currentRole = getCurrentRole();
    
    console.log('🔍 Child data load check (immediate):', {
      selectedChildId,
      currentRole,
      willCheck: true
    });
    
    // CRITICAL DEFENSIVE CHECK: If role is null or parent, be extremely cautious
    if (currentRole !== 'child') {
      console.log('⚠️ Not in child mode - checking for explicit parent selection');
      
      // If not in child mode, we must have explicit parent selection
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      
      if (!storedChildId || storedChildId !== selectedChildId) {
        console.log('🚫 BLOCKING child data load - not in child mode and no explicit selection:', {
          selectedChildId,
          storedChildId,
          currentRole,
          blocking: true
        });
        
        // Clear the stale selectedChildId from state
        console.log('🧹 Clearing stale selectedChildId');
        setSelectedChildIdState(null);
        
        // CRITICAL: Bail out immediately - do NOT proceed with data loading
        return;
      }
      
      console.log('✅ Parent mode with explicit selection - proceeding with load');
    } else {
      // In kid mode, always proceed with load
      console.log('✅ Kid mode - proceeding with load');
    }

    const loadChildData = async () => {
      try {
        console.log('📊 Loading child data for:', selectedChildId);
        const [events, attendance] = await Promise.all([
          getChildEvents(selectedChildId),
          getChildAttendance(selectedChildId)
        ]);
        
        setPointEvents(events);
        setAttendanceRecords(attendance);
        console.log('✅ Child data loaded successfully');
      } catch (error) {
        console.error('Error loading child data:', error);
        // Clear selectedChildId on error to prevent retry loops
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
      tokenPreview: accessToken ? accessToken.substring(0, 30) + '...' : 'null'
    });
    
    if (familyId) {
      localStorage.setItem('fgs_family_id', familyId);
      loadFamilyData();
    }
  }, [familyId, accessToken, loadFamilyData]);

  const addPointEvent = async (event: Omit<PointEvent, 'id' | 'timestamp'>) => {
    try {
      const newEvent = await logPointEvent(event);
      setPointEvents(prev => [newEvent, ...prev]);
      
      // Update local child state
      setChildren(prev => prev.map(child => {
        if (child.id === event.childId) {
          const newPoints = child.currentPoints + event.points;
          return {
            ...child,
            currentPoints: newPoints,
            highestMilestone: Math.max(child.highestMilestone, newPoints)
          };
        }
        return child;
      }));
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
      loggedBy: 'parent', // Simplified - in real auth, use authenticated user ID
      isAdjustment: true,
      adjustmentReason: reason
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
      'apology': 2,
      'reflection': 3,
      'correction': 5
    };

    const recovery = {
      childId,
      trackableItemId: 'recovery',
      points: recoveryPoints[recoveryAction],
      loggedBy: 'child', // Child-initiated
      isRecovery: true,
      recoveryFromEventId: negativeEventId,
      recoveryAction,
      recoveryNotes,
      notes: `Recovery: ${recoveryAction} - ${recoveryNotes}`
    };
    
    await addPointEvent(recovery);
  };

  const updateChildPoints = async (childId: string, points: number) => {
    const child = children.find(c => c.id === childId);
    if (!child) return;

    const newPoints = child.currentPoints + points;
    const newHighest = Math.max(child.highestMilestone, newPoints);

    try {
      await updateChild(childId, {
        currentPoints: newPoints,
        highestMilestone: newHighest
      });

      setChildren(prev => prev.map(c => 
        c.id === childId 
          ? { ...c, currentPoints: newPoints, highestMilestone: newHighest }
          : c
      ));
    } catch (error) {
      console.error('Error updating child points:', error);
      throw error;
    }
  };

  const addAttendance = async (record: Omit<AttendanceRecord, 'id' | 'timestamp'>) => {
    try {
      const newRecord = await createAttendance(record);
      setAttendanceRecords(prev => [newRecord, ...prev]);
    } catch (error) {
      console.error('Error adding attendance:', error);
      throw error;
    }
  };

  const getCurrentChild = () => {
    return children.find(c => c.id === selectedChildId);
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
        loading
      }}
    >
      {reactChildren}
    </FamilyContext.Provider>
  );
}

export function useFamilyContext() {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamilyContext must be used within FamilyProvider');
  }
  return context;
}

// Export alias for consistency
export const useFamily = useFamilyContext;