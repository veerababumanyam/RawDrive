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
import { SubscriptionBanner } from '../subscription';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../contexts/AuthContext';
import { useStorageUsage } from '../../hooks/useStorageUsage';

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
   - Fetches REAL storage data from the backend API
   ============================================================================= */

interface WorkspaceLayoutProps {
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
  notifications = [],
  maxWidth = 'none',
  noPadding = false,
  children,
}) => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, workspace } = useAuth();

  // Fetch real storage data from API
  const workspaceId = workspace?.workspace_id || '';
  const { storageUsage, subscriptionStatus } = useStorageUsage({
    workspaceId,
    autoFetch: !!workspaceId,
    autoRefresh: true,
    includeSubscription: true,
  });

  // Derive plan from subscription status, default to 'free'
  const planCode = subscriptionStatus?.plan?.code || storageUsage?.plan_code || 'free';
  const plan = planCode === 'starter' || planCode === 'professional' || planCode === 'business'
    ? 'pro'
    : planCode === 'enterprise'
    ? 'enterprise'
    : 'free';

  // Get real storage values from API (with fallbacks for loading state)
  const storageUsedBytes = storageUsage?.storage_used_bytes || 0;
  const storageLimitBytes = storageUsage?.storage_limit_bytes || (1 * 1024 * 1024 * 1024); // Default 1GB

  // Build user object for header
  const headerUser = user
    ? {
        name: user.displayName || user.email,
        email: user.email,
        avatar: user.avatarUrl,
      }
    : { name: 'User', email: '' };

  return (
    <AppShell>
      {/* Subscription Warning Banner - Top of page */}
      <SubscriptionBanner />

      {/* Header - Fixed at top, full width */}
      <WorkspaceHeader
        user={headerUser}
        notifications={notifications}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />

      {/* Content Area (Sidebar + Main) - Below header */}
      <AppShellContent>
        {/* Sidebar - Collapsible, starts below header */}
        <AppShellSidebar>
          <WorkspaceSidebar
            workspaceName={workspace?.name || 'My Workspace'}
            plan={plan}
            storageUsed={storageUsedBytes}
            storageLimit={storageLimitBytes}
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
