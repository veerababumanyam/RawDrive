/**
 * Admin Dashboard Page
 *
 * Platform administration dashboard for managing:
 * - Platform admins and roles
 * - Workspace overview
 * - Support access sessions
 * - Quick stats
 *
 * Feature: Admin Roles & Platform Management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  Building2,
  Eye,
  UserPlus,
  Search,
  RefreshCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  Activity,
  Headphones,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { adminService } from '../../services/adminService';
import { PLATFORM_ROLE_NAMES } from '@rawdrive/shared-constants';
import type { PlatformRoleType } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  platform_roles: string[];
  created_at: string;
  last_login_at: string | null;
}

interface Workspace {
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  owner_email: string;
  plan_code: string;
  created_at: string;
  member_count: number;
  gallery_count: number;
  storage_used_bytes: number;
}

interface SupportSession {
  session_id: string;
  workspace_id: string;
  workspace_name: string;
  started_by_user_id: string;
  started_by_email: string;
  justification: string;
  started_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtext,
  colorClass = 'text-primary',
}) => (
  <div className="glass-card rounded-xl p-4 hover:shadow-lg transition-shadow">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg bg-surface-hover ${colorClass}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {subtext && <p className="text-xs text-text-secondary truncate">{subtext}</p>}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Admin List Component
// ---------------------------------------------------------------------------

interface AdminListProps {
  admins: AdminUser[];
  isLoading: boolean;
  onRefresh: () => void;
}

const AdminList: React.FC<AdminListProps> = ({ admins, isLoading, onRefresh }) => {
  const getRoleBadgeColor = (role: string): string => {
    switch (role) {
      case 'super_admin':
        return 'bg-error/10 text-error';
      case 'platform_admin':
        return 'bg-primary/10 text-primary';
      case 'support_admin':
        return 'bg-accent/10 text-accent';
      case 'billing_admin':
        return 'bg-gold/10 text-gold';
      case 'content_moderator':
        return 'bg-purple-500/10 text-purple-500';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary';
    }
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-text-primary">Platform Admins</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label="Refresh admins"
        >
          <RefreshCcw className={`w-4 h-4 text-text-tertiary ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading && admins.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-secondary mt-2">Loading admins...</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="p-8 text-center">
          <Users className="w-10 h-10 text-text-tertiary mx-auto mb-2" />
          <p className="text-text-secondary">No platform admins found</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {admins.map((admin) => (
            <div key={admin.user_id} className="p-4 hover:bg-surface-hover/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-medium">
                  {admin.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">{admin.display_name}</p>
                  <p className="text-sm text-text-secondary truncate">{admin.email}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {admin.platform_roles.map((role) => (
                    <span
                      key={role}
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role)}`}
                    >
                      {PLATFORM_ROLE_NAMES[role as PlatformRoleType] || role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Workspace List Component
// ---------------------------------------------------------------------------

interface WorkspaceListProps {
  workspaces: Workspace[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
}

const WorkspaceList: React.FC<WorkspaceListProps> = ({
  workspaces,
  isLoading,
  searchQuery,
  onSearchChange,
  onRefresh,
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/10 text-success text-xs font-medium rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Active
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/10 text-error text-xs font-medium rounded-full">
            <XCircle className="w-3 h-3" />
            Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-text-tertiary/10 text-text-tertiary text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-text-primary">Workspaces</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-surface-hover border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 w-40"
            />
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Refresh workspaces"
          >
            <RefreshCcw className={`w-4 h-4 text-text-tertiary ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading && workspaces.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-secondary mt-2">Loading workspaces...</p>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="p-8 text-center">
          <Building2 className="w-10 h-10 text-text-tertiary mx-auto mb-2" />
          <p className="text-text-secondary">No workspaces found</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {workspaces.map((ws) => (
            <div key={ws.workspace_id} className="p-4 hover:bg-surface-hover/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-text-primary">{ws.name}</p>
                  {getStatusBadge(ws.status)}
                </div>
                <span className="text-xs px-2 py-0.5 bg-surface-hover text-text-secondary rounded-full uppercase">
                  {ws.plan_code}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span>{ws.owner_email}</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {ws.member_count}
                </span>
                <span>{formatBytes(ws.storage_used_bytes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Support Sessions Component
// ---------------------------------------------------------------------------

interface SupportSessionsProps {
  sessions: SupportSession[];
  isLoading: boolean;
  onEndSession: (sessionId: string) => void;
  onRefresh: () => void;
}

const SupportSessions: React.FC<SupportSessionsProps> = ({
  sessions,
  isLoading,
  onEndSession,
  onRefresh,
}) => {
  const formatTimeRemaining = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-text-primary">Active Support Sessions</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label="Refresh sessions"
        >
          <RefreshCcw className={`w-4 h-4 text-text-tertiary ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading && sessions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-secondary mt-2">Loading sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
          <p className="text-text-secondary">No active support sessions</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sessions.map((session) => (
            <div key={session.session_id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-text-primary">{session.workspace_name}</p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-gold">
                    <Clock className="w-3 h-3" />
                    {formatTimeRemaining(session.expires_at)}
                  </span>
                  <AppButton
                    variant="outline"
                    size="sm"
                    onClick={() => onEndSession(session.session_id)}
                  >
                    End
                  </AppButton>
                </div>
              </div>
              <p className="text-sm text-text-secondary mb-1">{session.justification}</p>
              <p className="text-xs text-text-tertiary">By {session.started_by_email}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const AdminDashboardPage: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = useState('');

  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setIsLoadingAdmins(true);
    try {
      const response = await adminService.listPlatformAdmins({ page: 1, limit: 20 });
      setAdmins(response.items as any);
    } catch (err) {
      console.error('Failed to load admins:', err);
      setError('Failed to load platform admins');
    } finally {
      setIsLoadingAdmins(false);
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    try {
      const response = await adminService.listWorkspaces({
        page: 1,
        per_page: 20,
        search: workspaceSearch || undefined,
      });
      setWorkspaces(response.items as any);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError('Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [workspaceSearch]);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await adminService.listSupportSessions();
      setSessions(response as any);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      // Don't show error for sessions - may not have permission
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const handleEndSession = useCallback(async (sessionId: string) => {
    try {
      await adminService.endSupportSession(sessionId);
      await loadSessions();
    } catch (err) {
      console.error('Failed to end session:', err);
      setError('Failed to end support session');
    }
  }, [loadSessions]);

  useEffect(() => {
    loadAdmins();
    loadWorkspaces();
    loadSessions();
  }, [loadAdmins, loadWorkspaces, loadSessions]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadWorkspaces();
    }, 300);
    return () => clearTimeout(debounce);
  }, [workspaceSearch]);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-primary">
                  <Shield className="w-5 h-5" />
                </div>
                Platform Administration
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Manage platform admins, workspaces, and support sessions
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-error/10 rounded"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Shield className="w-5 h-5" />}
            label="Platform Admins"
            value={admins.length}
            subtext="Active administrators"
            colorClass="text-primary"
          />
          <StatCard
            icon={<Building2 className="w-5 h-5" />}
            label="Workspaces"
            value={workspaces.length}
            subtext="Loaded workspaces"
            colorClass="text-accent"
          />
          <StatCard
            icon={<Headphones className="w-5 h-5" />}
            label="Support Sessions"
            value={sessions.length}
            subtext="Active sessions"
            colorClass="text-gold"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="System Status"
            value="Healthy"
            subtext="All services operational"
            colorClass="text-success"
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <AdminList
              admins={admins}
              isLoading={isLoadingAdmins}
              onRefresh={loadAdmins}
            />
            <SupportSessions
              sessions={sessions}
              isLoading={isLoadingSessions}
              onEndSession={handleEndSession}
              onRefresh={loadSessions}
            />
          </div>

          {/* Right Column */}
          <div>
            <WorkspaceList
              workspaces={workspaces}
              isLoading={isLoadingWorkspaces}
              searchQuery={workspaceSearch}
              onSearchChange={setWorkspaceSearch}
              onRefresh={loadWorkspaces}
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 glass-card rounded-xl p-4">
          <h3 className="font-semibold text-text-primary mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="/admin/gemini-models"
              className="flex items-center justify-between p-3 bg-surface-hover rounded-lg hover:bg-primary/10 transition-colors group"
            >
              <span className="text-sm font-medium text-text-primary">Manage AI Models</span>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary transition-colors" />
            </a>
            <button
              className="flex items-center justify-between p-3 bg-surface-hover rounded-lg hover:bg-primary/10 transition-colors group"
              onClick={() => {/* TODO: Open audit logs */}}
            >
              <span className="text-sm font-medium text-text-primary">View Audit Logs</span>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary transition-colors" />
            </button>
            <button
              className="flex items-center justify-between p-3 bg-surface-hover rounded-lg hover:bg-primary/10 transition-colors group"
              onClick={() => {/* TODO: Feature flags */}}
            >
              <span className="text-sm font-medium text-text-primary">Feature Flags</span>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary transition-colors" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboardPage;
