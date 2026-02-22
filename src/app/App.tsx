import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { FamilyProvider } from './contexts/FamilyContext';
import { AuthProvider } from './contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from './contexts/ViewModeContext';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TestStatusIndicator } from './components/TestStatusIndicator';
import React from "react";

const DevTestControlPanel = import.meta.env.DEV
  ? React.lazy(() => import("./components/TestControlPanel"))
  : null;

console.log('🚀 App.tsx loaded');

// Auto-load P0 test suite (always enabled for testing)
import('./utils/loadTestSuite').then(({ loadTestSuite }) => {
  // The loadTestSuite will auto-execute and make functions available
  console.log('🧪 Test suite auto-loading...');
}).catch(err => {
  console.warn('⚠️ Could not load test suite:', err.message);
});

export default function App() {
  console.log('🎯 App component rendering');
  
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FamilyProvider>
          <ViewModeProvider>
            <RouterProvider router={router} />
            <Toaster />
            <ModeTransitionOverlay />
            {import.meta.env.DEV && <TestStatusIndicator />}
            {import.meta.env.DEV && DevTestControlPanel ? (
  <React.Suspense fallback={null}>
    <DevTestControlPanel />
  </React.Suspense>
) : null}
          </ViewModeProvider>
        </FamilyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}