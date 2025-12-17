import React from 'react';
import {
  AppShell,
  AppShellHeader,
  AppShellSidebar,
  AppShellMain,
  AppShellContent,
} from '../layout/AppShell';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { WorkspaceHeader } from './WorkspaceHeader';
import { useTheme } from '../../hooks/useTheme';

/* =============================================================================
   WorkspaceLayout Component

   Main layout wrapper for all workspace pages.
   Composes AppShell with WorkspaceSidebar and WorkspaceHeader.
   ============================================================================= */

interface WorkspaceLayoutProps {
  /** Page content */
  children: React.ReactNode;
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
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  children,
  workspaceName = 'My Workspace',
  user = { name: 'John Doe', email: 'john@example.com' },
  plan = 'free',
  storageUsed = 0,
  storageLimit = 5 * 1024 * 1024 * 1024,
  notifications = [],
  maxWidth = 'none',
  noPadding = false,
}) => {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <AppShell>
      {/* Header */}
      <AppShellHeader sticky bordered>
        <WorkspaceHeader
          user={user}
          notifications={notifications}
          theme={resolvedTheme}
          onToggleTheme={toggleTheme}
        />
      </AppShellHeader>

      {/* Content Area (Sidebar + Main) */}
      <AppShellContent>
        {/* Sidebar */}
        <AppShellSidebar width={280} collapsedWidth={72}>
          <WorkspaceSidebar
            workspaceName={workspaceName}
            plan={plan}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
          />
        </AppShellSidebar>

        {/* Main Content */}
        <AppShellMain padded={!noPadding} maxWidth={maxWidth}>
          {children}
        </AppShellMain>
      </AppShellContent>
    </AppShell>
  );
};

export default WorkspaceLayout;
