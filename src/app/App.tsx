import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { FamilyProvider } from './contexts/FamilyContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from './contexts/ViewModeContext';
import { Toaster } from './components/ui/sonner';
import { SessionDebug } from './components/SessionDebug';
import { AuthStatusDebug } from './components/AuthStatusDebug';
import { ErrorBoundary } from './components/ErrorBoundary';

// Loading wrapper to prevent rendering until auth is initialized
function AppContent() {
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing session...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <SessionDebug />
      <AuthStatusDebug />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}