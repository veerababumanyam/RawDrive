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
} from '../services/auth';

// Context types
interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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

  // Initialize auth state from storage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if we have stored auth
        if (checkAuth()) {
          // Load stored user/workspace
          const storedUser = getStoredUser();
          const storedWorkspace = getStoredWorkspace();

          // If access token is expired, don't make API calls - just clear stale state
          // This prevents unnecessary 401 errors on public pages
          if (!hasValidAccessToken()) {
            // Token expired - clear everything and don't attempt API calls
            clearStoredTokens();
            setUser(null);
            setWorkspace(null);
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }

          if (storedUser) {
            setUser(storedUser);
            setWorkspace(storedWorkspace);
            setIsAuthenticated(true);

            // Refresh user data and workspace in background (only if we have valid token)
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
                  // API returned null - tokens are likely invalid, clear auth state
                  console.warn('Session invalid, clearing auth state');
                  clearStoredTokens();
                  setUser(null);
                  setWorkspace(null);
                  setIsAuthenticated(false);
                }
              })
              .catch((error) => {
                // Failed to validate session - clear tokens to prevent retry loop
                console.error('Failed to validate session, clearing auth state:', error);
                clearStoredTokens();
                setUser(null);
                setWorkspace(null);
                setIsAuthenticated(false);
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
              console.error('Failed to fetch user, clearing tokens:', error);
              clearStoredTokens();
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
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

  // Context value
  const value: AuthContextType = {
    user,
    workspace,
    isAuthenticated,
    isLoading,
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
