/**
 * AnalyticsDashboard: Display invitation analytics
 *
 * Shows view statistics, device breakdown, and RSVP conversions
 * for a digital invitation.
 *
 * Feature: 016-save-the-date Phase 12
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Eye,
  Users,
  Smartphone,
  Monitor,
  Tablet,
  TrendingUp,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useToast } from '@/hooks/useToast';
import { apiClient } from '@/services/api';

interface DeviceBreakdown {
  device_type: string;
  count: number;
}

interface ViewsOverTime {
  date: string;
  count: number;
}

interface AnalyticsSummary {
  total_views: number;
  unique_visitors: number;
  device_breakdown: DeviceBreakdown[];
  browser_breakdown: { browser: string; count: number }[];
  views_over_time: ViewsOverTime[];
  top_referrers: { referrer: string; count: number }[];
  period_days: number;
}

interface ConversionStats {
  total_views: number;
  total_rsvps: number;
  conversion_rate: number;
}

interface RealtimeStats {
  active_viewers: number;
  recent_views: number;
  period_minutes: number;
}

interface AnalyticsDashboardProps {
  workspaceId: string;
  invitationId: string;
}

const DeviceIcon: React.FC<{ deviceType: string }> = ({ deviceType }) => {
  switch (deviceType) {
    case 'mobile':
      return <Smartphone className="w-4 h-4" />;
    case 'tablet':
      return <Tablet className="w-4 h-4" />;
    case 'desktop':
    default:
      return <Monitor className="w-4 h-4" />;
  }
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  workspaceId,
  invitationId,
}) => {
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [conversion, setConversion] = useState<ConversionStats | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [summaryRes, conversionRes, realtimeRes] = await Promise.all([
        apiClient.get<AnalyticsSummary>(
          `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/analytics/summary?days=${periodDays}`
        ),
        apiClient.get<ConversionStats>(
          `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/analytics/conversion`
        ),
        apiClient.get<RealtimeStats>(
          `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/analytics/realtime`
        ),
      ]);

      if (summaryRes.data) setSummary(summaryRes.data);
      if (conversionRes.data) setConversion(conversionRes.data);
      if (realtimeRes.data) setRealtime(realtimeRes.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      showToast('Failed to load analytics', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [workspaceId, invitationId, periodDays]);

  // Refresh realtime stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.get<RealtimeStats>(
          `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/analytics/realtime`
        );
        if (res.data) setRealtime(res.data);
      } catch (error) {
        // Silently fail
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [workspaceId, invitationId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const maxViews = Math.max(...(summary?.views_over_time.map((v) => v.count) || [1]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Analytics
        </h3>
        <div className="flex items-center gap-3">
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-text-primary"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={fetchAnalytics}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </AppButton>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AppCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Eye className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {summary?.total_views.toLocaleString() || 0}
              </div>
              <div className="text-xs text-text-tertiary">Total Views</div>
            </div>
          </div>
        </AppCard>

        <AppCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {summary?.unique_visitors.toLocaleString() || 0}
              </div>
              <div className="text-xs text-text-tertiary">Unique Visitors</div>
            </div>
          </div>
        </AppCard>

        <AppCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {conversion?.conversion_rate || 0}%
              </div>
              <div className="text-xs text-text-tertiary">RSVP Rate</div>
            </div>
          </div>
        </AppCard>

        <AppCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {realtime?.active_viewers || 0}
              </div>
              <div className="text-xs text-text-tertiary">Active Now</div>
            </div>
          </div>
        </AppCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Views Over Time */}
        <AppCard className="p-4">
          <h4 className="font-medium text-text-primary mb-4">Views Over Time</h4>
          {summary?.views_over_time && summary.views_over_time.length > 0 ? (
            <div className="space-y-2">
              {summary.views_over_time.slice(-7).map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-text-tertiary">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1 h-6 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(day.count / maxViews) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-xs text-text-secondary text-right">{day.count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-text-tertiary">
              No view data available
            </div>
          )}
        </AppCard>

        {/* Device Breakdown */}
        <AppCard className="p-4">
          <h4 className="font-medium text-text-primary mb-4">Device Breakdown</h4>
          {summary?.device_breakdown && summary.device_breakdown.length > 0 ? (
            <div className="space-y-3">
              {summary.device_breakdown.map((device) => {
                const totalDevices = summary.device_breakdown.reduce((sum, d) => sum + d.count, 0);
                const percentage = totalDevices > 0 ? (device.count / totalDevices) * 100 : 0;

                return (
                  <div key={device.device_type} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-alt flex items-center justify-center text-text-secondary">
                      <DeviceIcon deviceType={device.device_type} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-text-primary capitalize">
                          {device.device_type}
                        </span>
                        <span className="text-sm text-text-secondary">
                          {device.count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-text-tertiary">
              No device data available
            </div>
          )}
        </AppCard>
      </div>

      {/* Conversion Stats */}
      {conversion && (
        <AppCard className="p-4">
          <h4 className="font-medium text-text-primary mb-4">Conversion Funnel</h4>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {conversion.total_views} Views
                </span>
              </div>
            </div>
            <div className="text-text-tertiary">→</div>
            <div className="flex-1">
              <div className="h-12 bg-success/20 rounded-lg flex items-center justify-center">
                <span className="text-sm font-medium text-success">
                  {conversion.total_rsvps} RSVPs
                </span>
              </div>
            </div>
            <div className="text-text-tertiary">→</div>
            <div className="w-24">
              <div className="h-12 bg-accent/20 rounded-lg flex items-center justify-center">
                <span className="text-sm font-medium text-accent">
                  {conversion.conversion_rate}%
                </span>
              </div>
            </div>
          </div>
        </AppCard>
      )}

      {/* Top Referrers */}
      {summary?.top_referrers && summary.top_referrers.length > 0 && (
        <AppCard className="p-4">
          <h4 className="font-medium text-text-primary mb-4">Top Referrers</h4>
          <div className="space-y-2">
            {summary.top_referrers.map((ref, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-text-secondary truncate max-w-[300px]">
                  {ref.referrer || 'Direct'}
                </span>
                <span className="text-sm font-medium text-text-primary">{ref.count}</span>
              </div>
            ))}
          </div>
        </AppCard>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
