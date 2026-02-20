import { Outlet } from 'react-router';
import { FamilyProvider } from '../contexts/FamilyContext';
import { ViewModeProvider, ModeTransitionOverlay } from '../contexts/ViewModeContext';
import { ReactNode } from 'react';

/**
 * ProvidersLayout wraps all authenticated routes with FamilyProvider and ViewModeProvider
 * This ensures the context is available to all child routes
 */
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  return (
    <FamilyProvider>
      <ViewModeProvider>
        {/* Render children if provided (for direct wrapping), otherwise use Outlet for nested routes */}
        {children || <Outlet />}
        <ModeTransitionOverlay />
      </ViewModeProvider>
    </FamilyProvider>
  );
}