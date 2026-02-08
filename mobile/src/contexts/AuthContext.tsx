/**
 * Authentication context for mobile app
 * Manages user authentication state and provides auth methods
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, useSegments } from 'expo-router';
import {
  login as authLogin,
  logout as authLogout,
  getCurrentUser,
  getStoredUser,
  getStoredTokens,
  isAuthenticated as checkIsAuthenticated,
  initSessionExpiredHandler,
} from '../services/auth';
import {
  authenticateWithBiometrics,
  shouldUseBiometricLogin,
  getBiometricStatus,
  type BiometricStatus,
} from '../services/biometricAuth';
import type { User, LoginCredentials } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricStatus: BiometricStatus | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  loginWithBiometrics: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkBiometricStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const router = useRouter();
  const segments = useSegments();

  const isAuthenticated = !!user;

  // Check biometric status
  const checkBiometricStatus = useCallback(async () => {
    const status = await getBiometricStatus();
    setBiometricStatus(status);
  }, []);

  // Initialize auth state
  useEffect(() => {
    async function initAuth() {
      try {
        // Check for stored tokens
        const tokens = await getStoredTokens();
        if (!tokens) {
          setIsLoading(false);
          return;
        }

        // Check if authenticated
        const authenticated = await checkIsAuthenticated();
        if (!authenticated) {
          setIsLoading(false);
          return;
        }

        // Try to get stored user first
        let storedUser = await getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }

        // Fetch fresh user data in background
        try {
          const freshUser = await getCurrentUser();
          if (freshUser) {
            setUser(freshUser);
          }
        } catch (error) {
          console.warn('Failed to fetch fresh user data:', error);
          // Keep using stored user
        }

        // Check biometric status
        await checkBiometricStatus();
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, [checkBiometricStatus]);

  // Handle session expired
  useEffect(() => {
    initSessionExpiredHandler(() => {
      setUser(null);
      router.replace('/(auth)/login');
    });
  }, [router]);

  // Handle route protection
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inPublicGroup = segments[0] === 'index';

    if (!isAuthenticated && !inAuthGroup && !inPublicGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || inPublicGroup)) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isLoading, router]);

  // Login with credentials
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const result = await authLogin(credentials);
      if (result.success && result.user) {
        setUser(result.user);
        await checkBiometricStatus();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    } finally {
      setIsLoading(false);
    }
  }, [checkBiometricStatus]);

  // Login with biometrics
  const loginWithBiometrics = useCallback(async () => {
    const canUseBiometrics = await shouldUseBiometricLogin();
    if (!canUseBiometrics) {
      return { success: false, error: 'Biometric login is not available' };
    }

    // Verify biometrics
    const authResult = await authenticateWithBiometrics();
    if (!authResult.success) {
      return authResult;
    }

    // Check if we have valid tokens
    const authenticated = await checkIsAuthenticated();
    if (!authenticated) {
      return { success: false, error: 'Session expired. Please login with password.' };
    }

    // Refresh user data
    setIsLoading(true);
    try {
      const freshUser = await getCurrentUser();
      if (freshUser) {
        setUser(freshUser);
        return { success: true };
      }
      return { success: false, error: 'Failed to load user data' };
    } catch (error) {
      console.error('Biometric login error:', error);
      return { success: false, error: 'Failed to complete login' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authLogout();
      setUser(null);
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await getCurrentUser();
      if (freshUser) {
        setUser(freshUser);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated,
    biometricStatus,
    login,
    loginWithBiometrics,
    logout,
    refreshUser,
    checkBiometricStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
