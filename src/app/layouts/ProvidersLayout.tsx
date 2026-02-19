import { Outlet } from 'react-router';
import { FamilyProvider } from '../contexts/FamilyContext';
import { ViewModeProvider, ModeTransitionOverlay } from '../contexts/ViewModeContext';

/**
 * ProvidersLayout wraps all authenticated routes with FamilyProvider and ViewModeProvider
 * This ensures the context is available to all child routes
 */
export function ProvidersLayout() {
  return (
    <FamilyProvider>
      <ViewModeProvider>
        <Outlet />
        <ModeTransitionOverlay />
      </ViewModeProvider>
    </FamilyProvider>
  );
}
