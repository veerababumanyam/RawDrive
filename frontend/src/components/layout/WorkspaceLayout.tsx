import React from 'react';
import { Outlet } from 'react-router-dom';
import {
  AppShell,
  AppShellSidebar,
  AppShellMain,
  AppShellContent,
} from './AppShell';
import { WorkspaceSidebar } from '../workspace/WorkspaceSidebar';
import { WorkspaceHeader } from '../workspace/WorkspaceHeader';
import { useTheme } from '../../hooks/useTheme';

/* =============================================================================
   WorkspaceLayout Component

   Main layout wrapper for all workspace pages.
   Composes AppShell with WorkspaceSidebar and WorkspaceHeader.

   IMPORTANT: This is the CENTRALIZED layout for all workspace pages.
   - Header is fixed at top with full width
   - Sidebar starts BELOW the header
   - Sidebar is collapsible (hide/show) and persists state
   - Mobile-first responsive design
   - Uses React Router's Outlet for nested routes
   ============================================================================= */

interface WorkspaceLayoutProps {
  /** Current workspace name */
  workspaceName?: string;
  /** Current user */
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  /** User's plan */
  plan?: 'free' | 'pro' | 'enterprise';
  /** Storage used in bytes */
  storageUsed?: number;
  /** Storage limit in bytes */
  storageLimit?: number;
  /** Notifications */
  notifications?: Array<{
    id: string;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
  /** Page title for breadcrumb (optional) */
  pageTitle?: string;
  /** Max width constraint for main content */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'none';
  /** Remove padding from main content */
  noPadding?: boolean;
  /** Optional children to render instead of Outlet */
  children?: React.ReactNode;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  workspaceName = 'My Workspace',
  user = { name: 'John Doe', email: 'john@example.com' },
  plan = 'free',
  storageUsed = 2.5 * 1024 * 1024 * 1024, // 2.5GB demo
  storageLimit = 5 * 1024 * 1024 * 1024,
  notifications = [],
  maxWidth = 'none',
  noPadding = false,
  children,
}) => {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <AppShell>
      {/* Header - Fixed at top, full width */}
      <WorkspaceHeader
        user={user}
        notifications={notifications}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />

      {/* Content Area (Sidebar + Main) - Below header */}
      <AppShellContent>
        {/* Sidebar - Collapsible, starts below header */}
        <AppShellSidebar>
          <WorkspaceSidebar
            workspaceName={workspaceName}
            plan={plan}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
          />
        </AppShellSidebar>

        {/* Main Content */}
        <AppShellMain padded={!noPadding} maxWidth={maxWidth}>
          {children || <Outlet />}
        </AppShellMain>
      </AppShellContent>
    </AppShell>
  );
};

export default WorkspaceLayout;
