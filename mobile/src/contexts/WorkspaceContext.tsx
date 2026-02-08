/**
 * Workspace context for mobile app
 * Manages current workspace and provides workspace switching
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  getStoredWorkspace,
  setStoredWorkspace,
} from '../services/secureStorage';
import { setCurrentWorkspaceId } from '../services/api';
import { getUserWorkspaces, getWorkspace } from '../services/auth';
import { useAuth } from './AuthContext';
import type { Workspace } from '../types';

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { user, isAuthenticated } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize workspace
  useEffect(() => {
    async function initWorkspace() {
      if (!isAuthenticated) {
        setWorkspace(null);
        setWorkspaces([]);
        setCurrentWorkspaceId(null);
        setIsLoading(false);
        return;
      }

      try {
        // Get stored workspace
        const storedWorkspace = await getStoredWorkspace();
        if (storedWorkspace) {
          setWorkspace(storedWorkspace);
          setCurrentWorkspaceId(storedWorkspace.workspace_id);
        }

        // Fetch all workspaces
        const userWorkspaces = await getUserWorkspaces();
        setWorkspaces(userWorkspaces);

        // If no stored workspace but user has workspaces, use the first one
        if (!storedWorkspace && userWorkspaces.length > 0) {
          const firstWorkspace = userWorkspaces[0];
          setWorkspace(firstWorkspace);
          setCurrentWorkspaceId(firstWorkspace.workspace_id);
          await setStoredWorkspace(firstWorkspace);
        }

        // If user has a default workspace from login, ensure it's selected
        if (user?.workspace_id && !storedWorkspace) {
          const userWorkspace = userWorkspaces.find(
            (ws) => ws.workspace_id === user.workspace_id
          );
          if (userWorkspace) {
            setWorkspace(userWorkspace);
            setCurrentWorkspaceId(userWorkspace.workspace_id);
            await setStoredWorkspace(userWorkspace);
          }
        }
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initWorkspace();
  }, [isAuthenticated, user?.workspace_id]);

  // Switch workspace
  const switchWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Find in cached workspaces first
      let targetWorkspace = workspaces.find((ws) => ws.workspace_id === workspaceId);

      // If not found, fetch from API
      if (!targetWorkspace) {
        const fetchedWorkspace = await getWorkspace(workspaceId);
        if (!fetchedWorkspace) {
          console.error('Workspace not found:', workspaceId);
          return false;
        }
        targetWorkspace = fetchedWorkspace;
      }

      // Update state
      setWorkspace(targetWorkspace);
      setCurrentWorkspaceId(targetWorkspace.workspace_id);
      await setStoredWorkspace(targetWorkspace);

      console.log('[Workspace] Switched to:', targetWorkspace.name);
      return true;
    } catch (error) {
      console.error('Failed to switch workspace:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [workspaces]);

  // Refresh workspaces list
  const refreshWorkspaces = useCallback(async () => {
    try {
      const userWorkspaces = await getUserWorkspaces();
      setWorkspaces(userWorkspaces);
    } catch (error) {
      console.error('Failed to refresh workspaces:', error);
    }
  }, []);

  const value: WorkspaceContextValue = {
    workspace,
    workspaces,
    isLoading,
    switchWorkspace,
    refreshWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

export default WorkspaceContext;
