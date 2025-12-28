/**
 * Authentication Context
 * Manages global auth state and provides auth methods
 * Requirements 13.2, 13.4, 13.5
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  Workspace,
  LoginCredentials,
  SignupData,
  login as authLogin,
  signup as authSignup,
  logout as authLogout,
  getCurrentUser,
  getStoredUser,
  getStoredWorkspace,
  isAuthenticated as checkAuth,
  hasValidAccessToken,
  clearStoredTokens,
  getGoogleOAuthUrl,
  getStoredTokens,
} from '../services/auth';
import { refreshAccessToken, AUTH_EVENTS } from '../services/api';

// Context types
interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpiredRedirect: string | null;
  clearSessionExpiredRedirect: () => void;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  googleOAuthUrl: (redirectTo?: string) => string;
}

// Create context with default values
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth Provider Component
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Track if session expired event was triggered to prevent multiple redirects
  const [sessionExpiredRedirect, setSessionExpiredRedirect] = useState<string | null>(null);

  // Listen for session expired events from API client
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent<{ redirectTo: string }>) => {
      console.warn('[Auth] Session expired event received');
      // Clear auth state
      clearStoredTokens();
      setUser(null);
      setWorkspace(null);
      setIsAuthenticated(false);
      // Store redirect path for navigation (will be handled by component using auth)
      setSessionExpiredRedirect(event.detail.redirectTo);
    };

    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired as EventListener);
    return () => {
      window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired as EventListener);
    };
  }, []);

  // Initialize auth state from storage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if we have stored auth (tokens exist)
        if (!checkAuth()) {
          setIsLoading(false);
          return;
        }

        // Load stored user/workspace for immediate display
        const storedUser = getStoredUser();
        const storedWorkspace = getStoredWorkspace();

        // If access token is expired, try to refresh it using the refresh token
        // This is the industry-standard approach - don't log out users unnecessarily
        if (!hasValidAccessToken()) {
          const tokens = getStoredTokens();

          // Only attempt refresh if we have a refresh token
          if (tokens?.refreshToken) {
            console.log('[Auth] Access token expired, attempting silent refresh...');
            const newAccessToken = await refreshAccessToken();

            if (!newAccessToken) {
              // Refresh failed - refresh token is also invalid/expired
              console.info('[Auth] Token refresh failed, session expired (continuing as guest)');
              clearStoredTokens();
              setUser(null);
              setWorkspace(null);
              setIsAuthenticated(false);
              setIsLoading(false);
              return;
            }

            console.log('[Auth] Token refresh successful');
            // Continue with normal flow - we now have a valid access token
          } else {
            // No refresh token available - clear and logout
            clearStoredTokens();
            setIsLoading(false);
            return;
          }
        }

        // Set initial state from storage for faster perceived loading
        if (storedUser) {
          setUser(storedUser);
          setWorkspace(storedWorkspace);
          setIsAuthenticated(true);

          // Refresh user data and workspace in background
          // IMPORTANT: This is a "fire and forget" refresh for data freshness.
          // We do NOT clear auth state on failure because:
          // 1. We already verified tokens are valid (or successfully refreshed) above
          // 2. Background API failures (network hiccups, timeouts) shouldn't log out users
          // 3. Only explicit logout or token refresh failure should clear auth state
          getCurrentUser()
            .then(async (freshUser) => {
              if (freshUser) {
                setUser(freshUser);
                // Fetch workspace if we have workspace_id but no workspace
                if ((freshUser as any).workspace_id && !storedWorkspace) {
                  const { getWorkspace } = await import('../services/auth');
                  const workspace = await getWorkspace((freshUser as any).workspace_id);
                  if (workspace) {
                    setWorkspace(workspace);
                  }
                }
              } else {
                // API returned null - this could be a transient error
                // Don't clear auth state, user has valid tokens from earlier check
                console.warn('[Auth] Background user refresh returned null, keeping existing session');
              }
            })
            .catch((error) => {
              // Background refresh failed - log but don't logout
              // The API client will handle 401s with token refresh
              console.warn('[Auth] Background user refresh failed, keeping existing session:', error);
            });
        } else {
          // Have tokens but no user - try to fetch
          try {
            const freshUser = await getCurrentUser();
            if (freshUser) {
              setUser(freshUser);
              setIsAuthenticated(true);
            } else {
              // Couldn't get user, clear tokens
              clearStoredTokens();
            }
          } catch (error) {
            // Failed, clear tokens
            console.error('[Auth] Failed to fetch user, clearing tokens:', error);
            clearStoredTokens();
          }
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error);
        // Clear any stale tokens on error
        clearStoredTokens();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Login handler
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const result = await authLogin(credentials);

      if (result.success && result.user) {
        setUser(result.user);
        setWorkspace(result.workspace || null);
        setIsAuthenticated(true);
        return { success: true };
      }

      return { success: false, error: result.error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Signup handler
  const signup = useCallback(async (data: SignupData) => {
    setIsLoading(true);
    try {
      const result = await authSignup(data);

      if (result.success && result.user) {
        setUser(result.user);
        setWorkspace(result.workspace || null);
        setIsAuthenticated(true);
        return { success: true };
      }

      return { success: false, error: result.error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout handler
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authLogout();
    } finally {
      setUser(null);
      setWorkspace(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, []);

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

  // Clear session expired redirect after navigation
  const clearSessionExpiredRedirect = useCallback(() => {
    setSessionExpiredRedirect(null);
  }, []);

  // Context value
  const value: AuthContextType = {
    user,
    workspace,
    isAuthenticated,
    isLoading,
    sessionExpiredRedirect,
    clearSessionExpiredRedirect,
    login,
    signup,
    logout,
    refreshUser,
    googleOAuthUrl: getGoogleOAuthUrl,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
