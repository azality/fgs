import { createBrowserRouter, Navigate } from "react-router";
import { ModeSelection } from "./pages/ModeSelection";
import { ParentLoginNew } from "./pages/ParentLoginNew";
import { ParentSignup } from "./pages/ParentSignup";
import { KidLoginNew } from "./pages/KidLoginNew";
import { Onboarding } from "./pages/Onboarding";
import { getCurrentMode, isAuthenticated } from "./utils/auth";

// Route protection components
function RequireParentAuth({ children }: { children: JSX.Element }) {
  const mode = getCurrentMode();
  
  if (mode !== 'parent') {
    return <Navigate to="/parent/login" replace />;
  }
  
  return children;
}

function RequireKidAuth({ children }: { children: JSX.Element }) {
  const mode = getCurrentMode();
  
  if (mode !== 'kid') {
    return <Navigate to="/kid/login" replace />;
  }
  
  return children;
}

export const router = createBrowserRouter([
  // Root - Mode Selection
  {
    path: "/",
    element: <ModeSelection />,
  },

  // ===== PARENT ROUTES =====
  {
    path: "/parent/login",
    element: <ParentLoginNew />,
  },
  {
    path: "/parent/signup",
    element: <ParentSignup />,
  },
  {
    path: "/parent/onboarding",
    element: <RequireParentAuth><Onboarding /></RequireParentAuth>,
  },
  {
    path: "/parent/home",
    element: <RequireParentAuth><div>Parent Dashboard (TODO)</div></RequireParentAuth>,
  },
  {
    path: "/parent/*",
    element: <RequireParentAuth><div>Parent Routes (TODO)</div></RequireParentAuth>,
  },

  // ===== KID ROUTES =====
  {
    path: "/kid/login",
    element: <KidLoginNew />,
  },
  {
    path: "/kid/home",
    element: <RequireKidAuth><div>Kid Dashboard (TODO)</div></RequireKidAuth>,
  },
  {
    path: "/kid/*",
    element: <RequireKidAuth><div>Kid Routes (TODO)</div></RequireKidAuth>,
  },

  // ===== LEGACY REDIRECTS =====
  {
    path: "/login",
    element: <Navigate to="/parent/login" replace />,
  },
  {
    path: "/parent-login",
    element: <Navigate to="/parent/login" replace />,
  },
  {
    path: "/kid-login",
    element: <Navigate to="/kid/login" replace />,
  },
  {
    path: "/welcome",
    element: <Navigate to="/" replace />,
  },

  // ===== DEBUG ROUTES =====
  {
    path: "/debug-storage",
    element: <div>Debug Storage (TODO - import from old routes)</div>,
  },
  {
    path: "/system-diagnostics",
    element: <div>System Diagnostics (TODO - import from old routes)</div>,
  },

  // 404 Catch-all
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
