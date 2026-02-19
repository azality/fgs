import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { KidAdventureHome } from './KidAdventureHome';

/**
 * DashboardRouter - Routes to the appropriate dashboard based on user role
 * 
 * - Kids (logged in via PIN) → KidAdventureHome (Unified adventure experience)
 * - Parents (logged in via email) → Dashboard (Analytics and controls)
 * 
 * Note: We check localStorage directly instead of using useAuth() because
 * this component is used in routes before the AuthProvider is available.
 */
export function DashboardRouter() {
  const [userRole, setUserRole] = useState(() => localStorage.getItem('user_role'));

  useEffect(() => {
    // Listen for role changes
    const handleRoleChange = () => {
      const newRole = localStorage.getItem('user_role');
      setUserRole(newRole);
    };

    // Listen for custom roleChanged events
    window.addEventListener('roleChanged', handleRoleChange);
    
    // Listen for storage events (from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        setUserRole(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('roleChanged', handleRoleChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Show KidAdventureHome for children
  if (userRole === 'child') {
    return <KidAdventureHome />;
  }

  // Show regular Dashboard for parents (default)
  return <Dashboard />;
}