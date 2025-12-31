/**
 * useWorkspace Hook
 *
 * Provides convenient access to the current workspace from the AuthContext.
 * Extracts workspace-specific data for use in workspace-scoped components.
 *
 * @example
 * ```tsx
 * const { workspaceId, workspaceName, isLoading } = useWorkspace();
 *
 * if (!workspaceId) {
 *   return <div>No workspace selected</div>;
 * }
 * ```
 */

import { useAuth } from '@/contexts/AuthContext';

export interface UseWorkspaceReturn {
  /** Current workspace ID (UUID) */
  workspaceId: string | null;
  /** Current workspace name */
  workspaceName: string | null;
  /** Full workspace object from AuthContext */
  workspace: ReturnType<typeof useAuth>['workspace'];
  /** Whether auth/workspace is still loading */
  isLoading: boolean;
  /** Whether user has a valid workspace */
  hasWorkspace: boolean;
}

/**
 * Hook to access current workspace data.
 *
 * This hook extracts workspace information from the AuthContext,
 * providing a cleaner API for workspace-scoped components.
 */
export function useWorkspace(): UseWorkspaceReturn {
  const { workspace, isLoading } = useAuth();

  return {
    workspaceId: workspace?.workspace_id ?? null,
    workspaceName: workspace?.name ?? null,
    workspace,
    isLoading,
    hasWorkspace: !!workspace?.workspace_id,
  };
}

export default useWorkspace;
