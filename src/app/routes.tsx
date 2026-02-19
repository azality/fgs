import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
import { DashboardRouter } from "./pages/DashboardRouter";
import { LogBehavior } from "./pages/LogBehavior";
import { WeeklyReview } from "./pages/WeeklyReview";
import { Adjustments } from "./pages/Adjustments";
import { AttendanceNew } from "./pages/AttendanceNew";
import { Rewards } from "./pages/Rewards";
import { AuditTrail } from "./pages/AuditTrail";
import { Settings } from "./pages/Settings";
import { EditRequests } from "./pages/EditRequests";
import { Quizzes } from "./pages/Quizzes";
import { QuizPlay } from "./pages/QuizPlay";
import { QuizStats } from "./pages/QuizStats";
import { Challenges } from "./pages/Challenges";
import { Welcome } from "./pages/Welcome";
import { ParentLogin } from "./pages/ParentLogin";
import { ParentSignup } from "./pages/ParentSignup";
import { KidLogin } from "./pages/KidLogin";
import { TitlesBadgesPage } from "./pages/TitlesBadgesPage";
import { SadqaPage } from "./pages/SadqaPage";
import { Onboarding } from "./pages/Onboarding";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DebugAuth } from "./pages/DebugAuth";
import { JWTDebugTest } from "./pages/JWTDebugTest";
import { DebugStorage } from "./pages/DebugStorage";
import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabase/client";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// Auth check component - redirects to onboarding if authenticated but no family
function RequireFamily({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true);
  const [hasFamilyAccess, setHasFamilyAccess] = useState(false);

  useEffect(() => {
    const checkFamilyAccess = async () => {
      try {
        // First check localStorage cache
        const cachedFamilyId = localStorage.getItem('fgs_family_id');
        
        if (cachedFamilyId) {
          console.log('✅ RequireFamily: Found cached family ID:', cachedFamilyId);
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
  }, []);

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
  {
    path: "/kid-login",
    element: <KidLogin />,
  },
  {
    path: "/onboarding",
    element: <ProtectedRoute><Onboarding /></ProtectedRoute>,
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
          { path: "log", element: <LogBehavior /> },
          { path: "challenges", element: <Challenges /> },
          { path: "review", element: <WeeklyReview /> },
          { path: "adjustments", element: <Adjustments /> },
          { path: "attendance", element: <AttendanceNew /> },
          { path: "rewards", element: <Rewards /> },
          { path: "audit", element: <AuditTrail /> },
          { path: "settings", element: <Settings /> },
          { path: "edit-requests", element: <EditRequests /> },
          { path: "quizzes", element: <Quizzes /> },
          { path: "quizzes/:id/play", element: <QuizPlay /> },
          { path: "quizzes/:id/stats", element: <QuizStats /> },
          { path: "titles-badges", element: <TitlesBadgesPage /> },
          { path: "sadqa", element: <SadqaPage /> },
          // Redirect old routes to homepage
          { path: "kid", element: <Navigate to="/" replace /> },
          { path: "parent", element: <Navigate to="/" replace /> },
          // Catch all 404s
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
  // Debug route
  {
    path: "/debug-auth",
    element: <DebugAuth />,
  },
  {
    path: "/debug-jwt",
    element: <JWTDebugTest />,
  },
  {
    path: "/debug-storage",
    element: <DebugStorage />,
  },
]);