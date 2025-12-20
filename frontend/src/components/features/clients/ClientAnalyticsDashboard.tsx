/**
 * ClientAnalyticsDashboard Component
 *
 * Analytics and insights dashboard for client data.
 * Requirements: 27.1-27.6 - Display metrics, trends, sources, geography, exportable reports
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  UserPlus,
  UserCheck,
  Image,
  MessageSquare,
  Clock,
  Download,
  RefreshCw,
  Loader2,
  Star,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type {
  DashboardAnalyticsResponse,
  MonthlyTrendItem,
} from '../../../types/client';

/* =============================================================================
   ClientAnalyticsDashboard Component
   ============================================================================= */

interface ClientAnalyticsDashboardProps {
  /** Workspace ID */
  workspaceId: string;
  /** Whether to show compact view */
  compact?: boolean;
}

export const ClientAnalyticsDashboard: React.FC<ClientAnalyticsDashboardProps> = ({
  workspaceId,
  compact = false,
}) => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // State
  const [dashboardData, setDashboardData] = useState<DashboardAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch analytics data
  const fetchAnalytics = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await clientService.getDashboardAnalytics(workspaceId);
        setDashboardData(data);
      } catch (error) {
        addToast({
          variant: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to load analytics',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, addToast]
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Export analytics
  const handleExport = useCallback(async () => {
    try {
      const result = await clientService.exportClients(workspaceId, {
        format: 'csv',
        include_contacts: true,
        include_addresses: true,
        include_tags: true,
      });

      const blob = new Blob([result.content], { type: result.content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast({
        variant: 'success',
        message: 'Analytics exported successfully',
      });
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to export analytics',
      });
    }
  }, [workspaceId, addToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="text-center py-12 text-text-tertiary">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
        <p>Failed to load analytics</p>
        <AppButton
          variant="ghost"
          size="sm"
          onClick={() => fetchAnalytics()}
          className="mt-4"
        >
          Try Again
        </AppButton>
      </div>
    );
  }

  const { overview, engagement, referrals, upcoming_followups, recent_clients, recent_activity, monthly_trend } = dashboardData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-text-tertiary" />
          <h2 className="text-lg font-semibold text-text-primary">
            Client Analytics
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={
              refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )
            }
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
          >
            Refresh
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExport}
          >
            Export
          </AppButton>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={20} />}
          label="Total Clients"
          value={overview.total_clients}
          trend={overview.growth_rate_percent}
          color="primary"
        />
        <StatCard
          icon={<UserCheck size={20} />}
          label="Active Clients"
          value={overview.active_clients}
          color="success"
        />
        <StatCard
          icon={<UserPlus size={20} />}
          label="New This Month"
          value={overview.new_clients_period}
          color="accent"
        />
        <StatCard
          icon={<Image size={20} />}
          label="With Galleries"
          value={overview.clients_with_galleries}
          color="info"
        />
      </div>

      {/* Charts Row */}
      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend */}
          <div className="card-glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <TrendingUp size={16} />
              Client Growth
            </h3>
            <MonthlyTrendChart data={monthly_trend} />
          </div>

          {/* Engagement Metrics */}
          <div className="card-glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Activity size={16} />
              Engagement Overview
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat
                icon={<MessageSquare size={14} />}
                label="Communications"
                value={engagement.total_communications}
              />
              <MiniStat
                icon={<Activity size={14} />}
                label="Activities"
                value={engagement.total_activities}
              />
              <MiniStat
                icon={<Image size={14} />}
                label="Gallery Links"
                value={engagement.gallery_links_created}
              />
              <MiniStat
                icon={<Clock size={14} />}
                label="Follow-up Rate"
                value={`${Math.round(engagement.follow_up_completion_rate * 100)}%`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Three Column Section */}
      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Upcoming Follow-ups */}
          <div className="card-glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Clock size={16} />
              Upcoming Follow-ups
            </h3>
            {upcoming_followups.length === 0 ? (
              <div className="text-center py-6 text-text-tertiary text-sm">
                No pending follow-ups
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming_followups.slice(0, 5).map((followup) => (
                  <button
                    key={followup.communication_id}
                    onClick={() =>
                      navigate(`/workspace/clients/${followup.client_id}`)
                    }
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                      <Clock size={14} className="text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {followup.client_name}
                      </p>
                      <p className="text-xs text-text-tertiary truncate">
                        {followup.subject || 'Follow-up scheduled'}
                      </p>
                    </div>
                    {followup.follow_up_date && (
                      <span className="text-xs text-warning">
                        {new Date(followup.follow_up_date).toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Clients */}
          <div className="card-glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <UserPlus size={16} />
              Recent Clients
            </h3>
            {recent_clients.length === 0 ? (
              <div className="text-center py-6 text-text-tertiary text-sm">
                No recent clients
              </div>
            ) : (
              <div className="space-y-2">
                {recent_clients.slice(0, 5).map((client) => (
                  <button
                    key={client.client_id}
                    onClick={() =>
                      navigate(`/workspace/clients/${client.client_id}`)
                    }
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      {client.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {client.full_name}
                      </p>
                      {client.created_at && (
                        <p className="text-xs text-text-tertiary">
                          Added{' '}
                          {new Date(client.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-text-tertiary"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card-glass rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Activity size={16} />
              Recent Activity
            </h3>
            {recent_activity.length === 0 ? (
              <div className="text-center py-6 text-text-tertiary text-sm">
                No recent activity
              </div>
            ) : (
              <div className="space-y-2">
                {recent_activity.slice(0, 5).map((activity) => (
                  <button
                    key={activity.activity_id}
                    onClick={() =>
                      navigate(`/workspace/clients/${activity.client_id}`)
                    }
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                      <Activity size={14} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {activity.client_name}
                      </p>
                      <p className="text-xs text-text-tertiary truncate">
                        {activity.description ||
                          activity.activity_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Referral Stats */}
      {!compact && (
        <div className="card-glass rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Star size={16} />
            Referral Insights
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat
              icon={<Users size={14} />}
              label="Referred Clients"
              value={referrals.total_referred_clients}
            />
            <MiniStat
              icon={<TrendingUp size={14} />}
              label="Referral Rate"
              value={`${Math.round(referrals.referral_rate_percent)}%`}
            />
            <MiniStat
              icon={<Star size={14} />}
              label="Top Referrers"
              value={referrals.clients_who_refer}
            />
            <MiniStat
              icon={<UserPlus size={14} />}
              label="Avg per Referrer"
              value={referrals.avg_referrals_per_referrer.toFixed(1)}
            />
          </div>
        </div>
      )}

      {/* View All Link */}
      {compact && (
        <div className="text-center">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => navigate('/workspace/clients')}
            rightIcon={<ArrowRight size={14} />}
          >
            View All Clients
          </AppButton>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   StatCard Component
   ============================================================================= */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  trend?: number;
  color: 'primary' | 'success' | 'accent' | 'info' | 'warning';
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  trend,
  color,
}) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    accent: 'bg-accent/10 text-accent',
    info: 'bg-info/10 text-info',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-glass rounded-xl p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        {trend !== undefined && trend !== 0 && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend > 0 ? 'text-success' : 'text-error'
            }`}
          >
            {trend > 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </motion.div>
  );
};

/* =============================================================================
   MiniStat Component
   ============================================================================= */

interface MiniStatProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}

const MiniStat: React.FC<MiniStatProps> = ({ icon, label, value }) => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover/50">
      <div className="p-2 rounded-lg bg-surface-hover text-text-tertiary">
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
};

/* =============================================================================
   MonthlyTrendChart Component
   ============================================================================= */

interface MonthlyTrendChartProps {
  data: MonthlyTrendItem[];
}

const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        No trend data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.slice(-6).map((item, index) => (
        <div key={item.month} className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary w-12">
            {new Date(item.month + '-01').toLocaleDateString('en-US', {
              month: 'short',
            })}
          </span>
          <div className="flex-1 h-6 bg-surface-hover rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / maxCount) * 100}%` }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
            />
          </div>
          <span className="text-xs font-medium text-text-primary w-8 text-right">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ClientAnalyticsDashboard;
