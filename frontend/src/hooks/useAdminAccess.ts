/**
 * Admin Access Hook
 *
 * Check if the current user has platform admin roles.
 * Makes a lightweight API call to check admin status.
 *
 * @module useAdminAccess
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

interface AdminAccessState {
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  isSupportAdmin: boolean;
  isBillingAdmin: boolean;
  roles: string[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Check if user has any platform admin roles
 */
export function useAdminAccess(): AdminAccessState {
  const [state, setState] = useState<AdminAccessState>({
    isAdmin: false,
    isPlatformAdmin: false,
    isSuperAdmin: false,
    isSupportAdmin: false,
    isBillingAdmin: false,
    roles: [],
    isLoading: true,
    error: null,
  });

  const checkAdminAccess = useCallback(async () => {
    try {
      // Try to access admin endpoint - if successful, user has admin access
      const response = await apiClient.get<{ items: any[]; total: number }>('/api/v1/admin/admins?page=1&per_page=1');

      // If we get here without 403, user has at least platform:admins:read permission
      // This is a proxy for having some admin role
      setState({
        isAdmin: true,
        isPlatformAdmin: true, // If they can read admins, they have platform admin access
        isSuperAdmin: false, // Would need to check specific permissions
        isSupportAdmin: false,
        isBillingAdmin: false,
        roles: ['platform_admin'], // Basic role indicator
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      // 403 means user doesn't have admin access
      if (err.message?.includes('403') || err.status === 403) {
        setState({
          isAdmin: false,
          isPlatformAdmin: false,
          isSuperAdmin: false,
          isSupportAdmin: false,
          isBillingAdmin: false,
          roles: [],
          isLoading: false,
          error: null,
        });
      } else {
        // Other errors - still not admin but log error
        console.debug('Admin access check failed:', err);
        setState({
          isAdmin: false,
          isPlatformAdmin: false,
          isSuperAdmin: false,
          isSupportAdmin: false,
          isBillingAdmin: false,
          roles: [],
          isLoading: false,
          error: null, // Don't show error to non-admin users
        });
      }
    }
  }, []);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  return state;
}

export default useAdminAccess;
