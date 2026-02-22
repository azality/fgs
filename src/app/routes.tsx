import { createBrowserRouter, Navigate } from "react-router";
import { Welcome } from "./pages/Welcome";
import { ParentLogin } from "./pages/ParentLogin";
import { ParentSignup } from "./pages/ParentSignup";
import { KidLoginNew } from "./pages/KidLoginNew";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
import { RootLayout } from "./layouts/RootLayout";
import { DashboardRouter } from "./pages/DashboardRouter";
import { LogBehavior } from "./pages/LogBehavior";
import { WeeklyReview } from "./pages/WeeklyReview";
import { Adjustments } from "./pages/Adjustments";
import { AttendanceNew } from "./pages/AttendanceNew";
import { Rewards } from "./pages/Rewards";
import { AuditTrail } from "./pages/AuditTrail";
import { Settings } from "./pages/Settings";
import { EditRequests } from "./pages/EditRequests";
import { TitlesBadgesPage } from "./pages/TitlesBadgesPage";
import { Quizzes } from "./pages/Quizzes";
import { QuizPlay } from "./pages/QuizPlay";
import { QuizStats } from "./pages/QuizStats";
import { Challenges } from "./pages/Challenges";
import { SadqaPage } from "./pages/SadqaPage";
import { Onboarding } from "./pages/Onboarding";
import { JoinPending } from "./pages/JoinPending";
import { KidDashboard } from "./pages/KidDashboard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireParentRole } from "./components/RequireParentRole";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ParentWishlistReview } from "./pages/ParentWishlistReview";
import { PendingRedemptionRequests } from "./pages/PendingRedemptionRequests";
import { KidWishlist } from "./pages/KidWishlist";
import { PrayerLogging } from "./pages/PrayerLogging";
import { PrayerApprovals } from "./pages/PrayerApprovals";
import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabase/client";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { getCurrentMode } from "./utils/auth";
import { useFamilyContext } from "./contexts/FamilyContext";
import { AppModeGuard } from "./components/AppModeGuard";
import { getAppMode, getDefaultRoute } from "./utils/appMode";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// Kid auth protection - checks for kid session
function RequireKidAuth({ children }: { children: JSX.Element }) {
  const mode = getCurrentMode();
  
  console.log('🔒 RequireKidAuth check:', {
    mode,
    userMode: localStorage.getItem('user_mode'),
    userRole: localStorage.getItem('user_role'),
    kidAccessToken: !!localStorage.getItem('kid_access_token'),
    pathname: window.location.pathname
  });
  
  if (mode !== 'kid') {
    console.log('❌ RequireKidAuth: Not in kid mode, redirecting to /kid/login');
    return <Navigate to="/kid/login" replace />;
  }
  
  console.log('✅ RequireKidAuth: Kid mode detected, allowing access');
  return children;
}

// Auth check component - redirects to onboarding if authenticated but no family
function RequireFamily({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true);
  const [hasFamilyAccess, setHasFamilyAccess] = useState(false);
  const { setFamilyId } = useFamilyContext();

  useEffect(() => {
    const checkFamilyAccess = async () => {
      try {
        // First check localStorage cache
        const cachedFamilyId = localStorage.getItem('fgs_family_id');
        
        if (cachedFamilyId) {
          console.log('✅ RequireFamily: Found cached family ID:', cachedFamilyId);
          // CRITICAL: Set the familyId in FamilyContext so it loads children!
          setFamilyId(cachedFamilyId);
          setHasFamilyAccess(true);
          setLoading(false);
          return;
        }

        // No cached family ID - this is a new user or first-time login
        // Just redirect to onboarding - they'll create a family there
        console.log('⚠️ RequireFamily: No cached family ID - user needs to complete onboarding');
        setHasFamilyAccess(false);
        setLoading(false);
      } catch (error) {
        console.error('❌ RequireFamily: Error checking family access:', error);
        setHasFamilyAccess(false);
        setLoading(false);
      }
    };

    checkFamilyAccess();
  }, [setFamilyId]);

  // Show loading state while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to onboarding if no family access
  if (!hasFamilyAccess) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

export const router = createBrowserRouter([
  // Public routes - accessible without auth
  {
    path: "/welcome",
    element: <Welcome />,
  },
  {
    path: "/login",
    element: <ParentLogin />,
  },
  {
    path: "/parent-login",
    element: <ParentLogin />,
  },
  {
    path: "/signup",
    element: <ParentSignup />,
  },
  // Legacy kid login - redirect to new implementation
  {
    path: "/kid-login",
    element: <Navigate to="/kid-login-new" replace />,
  },
  {
    path: "/kid-login-new",
    element: <KidLoginNew />,
  },
  // Alias for kid login (used in some links)
  {
    path: "/kid/login",
    element: <KidLoginNew />,
  },
  {
    path: "/onboarding",
    element: <ProtectedRoute><Onboarding /></ProtectedRoute>,
  },
  {
    path: "/join-pending",
    element: <ProtectedRoute><JoinPending /></ProtectedRoute>,
  },
  // Protected routes - require auth AND family
  // Wrapped with ProvidersLayout to ensure FamilyContext and ViewModeContext are available
  {
    path: "/",
    element: <ProtectedRoute><RequireFamily><ProvidersLayout /></RequireFamily></ProtectedRoute>,
    children: [
      {
        path: "/",
        element: <RootLayout />,
        children: [
          { index: true, element: <DashboardRouter /> },
          { path: "log", element: <RequireParentRole><LogBehavior /></RequireParentRole> },
          { path: "review", element: <RequireParentRole><WeeklyReview /></RequireParentRole> },
          { path: "adjustments", element: <RequireParentRole><Adjustments /></RequireParentRole> },
          { path: "attendance", element: <RequireParentRole><AttendanceNew /></RequireParentRole> },
          { path: "rewards", element: <RequireParentRole><Rewards /></RequireParentRole> },
          { path: "audit", element: <RequireParentRole><AuditTrail /></RequireParentRole> },
          { path: "settings", element: <RequireParentRole><Settings /></RequireParentRole> },
          { path: "edit-requests", element: <RequireParentRole><EditRequests /></RequireParentRole> },
          { path: "quizzes", element: <Quizzes /> },
          { path: "quizzes/:id/play", element: <QuizPlay /> },
          { path: "quizzes/:id/stats", element: <QuizStats /> },
          { path: "wishlist", element: <RequireParentRole><ParentWishlistReview /></RequireParentRole> },
          { path: "redemption-requests", element: <RequireParentRole><PendingRedemptionRequests /></RequireParentRole> },
          { path: "challenges", element: <Challenges /> },
          { path: "titles-badges", element: <TitlesBadgesPage /> },
          { path: "sadqa", element: <SadqaPage /> },
          { path: "prayer-approvals", element: <RequireParentRole><PrayerApprovals /></RequireParentRole> },
          // Redirect old routes to homepage
          { path: "kid", element: <Navigate to="/" replace /> },
          { path: "parent", element: <Navigate to="/" replace /> },
          // Catch all 404s
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
  // Kid routes - require kid auth only (NO parent auth needed)
  // Wrapped with ProvidersLayout to provide FamilyContext and other contexts
  {
    path: "/kid/home",
    element: <RequireKidAuth><ProvidersLayout><KidDashboard /></ProvidersLayout></RequireKidAuth>,
  },
  {
    path: "/kid/wishlist",
    element: <RequireKidAuth><ProvidersLayout><KidWishlist /></ProvidersLayout></RequireKidAuth>,
  },
  {
    path: "/kid/prayers",
    element: <RequireKidAuth><ProvidersLayout><PrayerLogging /></ProvidersLayout></RequireKidAuth>,
  },
]);