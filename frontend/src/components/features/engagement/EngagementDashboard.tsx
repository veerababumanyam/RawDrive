/**
 * EngagementDashboard Component
 *
 * Comprehensive dashboard for engagement scoring system.
 * Displays tier distribution, high-intent clients, churn risks, and recommendations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Target,
  Clock,
  MessageSquare,
  RefreshCw,
  Loader2,
  ChevronRight,
  Flame,
  Snowflake,
  Sun,
  Zap,
  Star,
  Gift,
  Mail,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  engagementService,
  type EngagementDashboard as DashboardData,
  type ScoreTier,
  type HighIntentClient,
  type ChurnRiskClient,
  type PendingRecommendation,
} from '../../../services/engagementService';

/* =============================================================================
   Types
   ============================================================================= */

interface EngagementDashboardProps {
  workspaceId: string;
  onClientClick?: (clientId: string) => void;
  compact?: boolean;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getTierConfig = (tier: ScoreTier) => {
  const configs: Record<ScoreTier, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
    champion: {
      label: 'Champion',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      icon: <Star size={16} className="text-amber-500" />,
    },
    hot: {
      label: 'Hot',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      icon: <Flame size={16} className="text-red-500" />,
    },
    warm: {
      label: 'Warm',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      icon: <Sun size={16} className="text-orange-500" />,
    },
    cool: {
      label: 'Cool',
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      icon: <Snowflake size={16} className="text-blue-400" />,
    },
    cold: {
      label: 'Cold',
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10',
      icon: <Snowflake size={16} className="text-blue-600" />,
    },
    at_risk: {
      label: 'At Risk',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      icon: <AlertTriangle size={16} className="text-yellow-500" />,
    },
    churned: {
      label: 'Churned',
      color: 'text-neutral-500',
      bgColor: 'bg-neutral-500/10',
      icon: <TrendingDown size={16} className="text-neutral-500" />,
    },
  };
  return configs[tier] || configs.cold;
};

const getRecommendationIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    email_timing: <Mail size={16} />,
    photo_highlight: <Sparkles size={16} />,
    special_offer: <Gift size={16} />,
    check_in: <MessageSquare size={16} />,
    re_engagement: <Zap size={16} />,
    upsell: <TrendingUp size={16} />,
    feedback_request: <MessageSquare size={16} />,
    referral_ask: <Users size={16} />,
  };
  return icons[type] || <Target size={16} />;
};

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    urgent: 'text-red-500 bg-red-500/10',
    high: 'text-orange-500 bg-orange-500/10',
    medium: 'text-blue-500 bg-blue-500/10',
    low: 'text-neutral-500 bg-neutral-500/10',
  };
  return colors[priority] || colors.medium;
};

/* =============================================================================
   Sub Components
   ============================================================================= */

const StatCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  suffix?: string;
}> = ({ label, value, icon, trend, suffix }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-surface-secondary rounded-xl p-4 border border-border"
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-text-tertiary text-sm">{label}</span>
      <span className="text-text-tertiary">{icon}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-text-primary">{value}</span>
      {suffix && <span className="text-text-tertiary text-sm">{suffix}</span>}
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-1 text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        <span>{Math.abs(trend).toFixed(1)}%</span>
      </div>
    )}
  </motion.div>
);

const TierDistributionChart: React.FC<{
  distribution: DashboardData['tier_distribution'];
  total: number;
}> = ({ distribution, total }) => {
  const tiers: ScoreTier[] = ['champion', 'hot', 'warm', 'cool', 'cold', 'at_risk', 'churned'];

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4">Engagement Distribution</h3>
      <div className="space-y-3">
        {tiers.map((tier) => {
          const config = getTierConfig(tier);
          const count = distribution[tier] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={tier} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${config.bgColor}`}>
                {config.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-secondary">{config.label}</span>
                  <span className="text-sm font-medium text-text-primary">{count}</span>
                </div>
                <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${config.bgColor.replace('/10', '')}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HighIntentList: React.FC<{
  clients: HighIntentClient[];
  onClientClick?: (clientId: string) => void;
}> = ({ clients, onClientClick }) => {
  if (clients.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Target size={16} className="text-green-500" />
          High-Intent Clients
        </h3>
        <p className="text-text-tertiary text-sm text-center py-4">
          No high-intent clients detected
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Target size={16} className="text-green-500" />
        High-Intent Clients
        <span className="ml-auto text-xs text-text-tertiary">{clients.length} clients</span>
      </h3>
      <div className="space-y-2">
        {clients.slice(0, 5).map((client) => {
          const tierConfig = client.score_tier ? getTierConfig(client.score_tier) : null;
          return (
            <motion.button
              key={client.client_id}
              onClick={() => onClientClick?.(client.client_id)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-tertiary transition-colors text-left"
              whileHover={{ x: 4 }}
            >
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 font-medium">
                {Math.round(client.high_intent_score)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {client.client_name}
                </p>
                <p className="text-xs text-text-tertiary">
                  {client.high_intent_signals.length} signals detected
                </p>
              </div>
              {tierConfig && (
                <span className={`px-2 py-0.5 rounded text-xs ${tierConfig.bgColor} ${tierConfig.color}`}>
                  {tierConfig.label}
                </span>
              )}
              {client.requires_immediate_action && (
                <AlertTriangle size={14} className="text-amber-500" />
              )}
              <ChevronRight size={16} className="text-text-tertiary" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

const ChurnRiskList: React.FC<{
  clients: ChurnRiskClient[];
  onClientClick?: (clientId: string) => void;
}> = ({ clients, onClientClick }) => {
  if (clients.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          Churn Risk Clients
        </h3>
        <p className="text-text-tertiary text-sm text-center py-4">
          No clients at risk of churning
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-500" />
        Churn Risk Clients
        <span className="ml-auto text-xs text-text-tertiary">{clients.length} at risk</span>
      </h3>
      <div className="space-y-2">
        {clients.slice(0, 5).map((client) => (
          <motion.button
            key={client.client_id}
            onClick={() => onClientClick?.(client.client_id)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-tertiary transition-colors text-left"
            whileHover={{ x: 4 }}
          >
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-medium">
              {Math.round(client.churn_risk_score)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {client.client_name}
              </p>
              <p className="text-xs text-text-tertiary">
                {client.days_since_last_activity !== undefined
                  ? `${client.days_since_last_activity} days inactive`
                  : `${client.churn_risk_factors.length} risk factors`}
              </p>
            </div>
            {client.requires_immediate_action && (
              <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-500">
                Urgent
              </span>
            )}
            <ChevronRight size={16} className="text-text-tertiary" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

const RecommendationsList: React.FC<{
  recommendations: PendingRecommendation[];
  onClientClick?: (clientId: string) => void;
  onActionClick?: (recommendation: PendingRecommendation) => void;
}> = ({ recommendations, onClientClick, onActionClick }) => {
  if (recommendations.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          Recommended Actions
        </h3>
        <p className="text-text-tertiary text-sm text-center py-4">
          No pending recommendations
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        Recommended Actions
        <span className="ml-auto text-xs text-text-tertiary">{recommendations.length} pending</span>
      </h3>
      <div className="space-y-2">
        {recommendations.slice(0, 6).map((rec) => (
          <motion.div
            key={rec.recommendation_id}
            className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-tertiary transition-colors"
            whileHover={{ x: 4 }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getPriorityColor(rec.priority)}`}>
              {getRecommendationIcon(rec.recommendation_type)}
            </div>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => onClientClick?.(rec.client_id)}
                className="text-sm font-medium text-text-primary hover:text-primary truncate block text-left"
              >
                {rec.client_name}
              </button>
              <p className="text-xs text-text-tertiary truncate">
                {rec.trigger_reason}
              </p>
              {rec.optimal_contact_time && (
                <p className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  {new Date(rec.optimal_contact_time).toLocaleDateString()}
                </p>
              )}
            </div>
            <span className={`px-2 py-0.5 rounded text-xs ${getPriorityColor(rec.priority)}`}>
              {rec.priority}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const EngagementDashboard: React.FC<EngagementDashboardProps> = ({
  workspaceId,
  onClientClick,
  compact = false,
}) => {
  const { addToast } = useToast();

  // State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch dashboard data
  const fetchDashboard = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await engagementService.getDashboard(workspaceId);
        setDashboardData(data);
      } catch (error) {
        addToast({
          variant: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to load engagement data',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, addToast]
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

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
        <Target size={48} className="mx-auto mb-4 opacity-50" />
        <p>Failed to load engagement data</p>
        <AppButton
          variant="ghost"
          size="sm"
          onClick={() => fetchDashboard()}
          className="mt-4"
        >
          Try Again
        </AppButton>
      </div>
    );
  }

  const { summary, tier_distribution, high_intent_clients, churn_risk_clients, pending_recommendations } = dashboardData;
  const totalScored = summary.total_scored_clients;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Engagement Scoring
          </h2>
          <p className="text-sm text-text-tertiary">
            Track client engagement and get personalized follow-up recommendations
          </p>
        </div>
        <AppButton
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}
          onClick={() => fetchDashboard(true)}
          disabled={refreshing}
        >
          Refresh
        </AppButton>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Scored"
          value={summary.total_scored_clients}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Engaged"
          value={summary.engaged_clients}
          icon={<Flame size={20} className="text-orange-500" />}
        />
        <StatCard
          label="At Risk"
          value={summary.at_risk_clients}
          icon={<AlertTriangle size={20} className="text-amber-500" />}
        />
        <StatCard
          label="Engagement Rate"
          value={summary.engagement_rate}
          suffix="%"
          icon={<TrendingUp size={20} className="text-green-500" />}
        />
      </div>

      {/* Main Content */}
      {compact ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HighIntentList
            clients={high_intent_clients}
            onClientClick={onClientClick}
          />
          <ChurnRiskList
            clients={churn_risk_clients}
            onClientClick={onClientClick}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TierDistributionChart
            distribution={tier_distribution}
            total={totalScored}
          />
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HighIntentList
                clients={high_intent_clients}
                onClientClick={onClientClick}
              />
              <ChurnRiskList
                clients={churn_risk_clients}
                onClientClick={onClientClick}
              />
            </div>
            <RecommendationsList
              recommendations={pending_recommendations}
              onClientClick={onClientClick}
            />
          </div>
        </div>
      )}

      {/* Generated timestamp */}
      <p className="text-xs text-text-tertiary text-right">
        Last updated: {new Date(dashboardData.generated_at).toLocaleString()}
      </p>
    </div>
  );
};

export default EngagementDashboard;
