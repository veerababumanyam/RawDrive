/**
 * Protected Route Component
 * Redirects to signin if not authenticated
 * Requirement 13.1
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Loading spinner component
const LoadingSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-text-secondary">Loading...</p>
    </div>
  </div>
);

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Required permissions to access this route */
  requiredPermissions?: string[];
  /** Redirect path if not authenticated */
  redirectTo?: string;
}

/**
 * Protected Route wrapper
 * Checks authentication and optionally permissions
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions: _requiredPermissions = [],
  redirectTo = '/signin',
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show loading while checking auth state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect to signin if not authenticated
  if (!isAuthenticated) {
    // Preserve the attempted URL for redirect after login
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${redirectTo}?redirect=${returnUrl}`} replace />;
  }

  // Check email verification if required
  if (user && !user.emailVerified) {
    // Could redirect to email verification page
    // For now, just allow access
  }

  // Permission check would go here if we had permissions in context
  // For now, just allow access if authenticated

  return <>{children}</>;
};

/**
 * Hook to check if user has permission
 */
export function useHasPermission(_permission: string): boolean {
  const { isAuthenticated } = useAuth();
  // TODO: Implement actual permission check
  return isAuthenticated;
}

export default ProtectedRoute;
