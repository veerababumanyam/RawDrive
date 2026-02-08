/**
 * ChurnDashboard Component
 *
 * Comprehensive dashboard for churn prediction and prevention.
 * Displays risk distribution, at-risk clients, active campaigns, and A/B experiments.
 *
 * Enhanced Features:
 * - At-risk customers with churn probability scores and predicted reasons
 * - Suggested interventions (feature unlock, credit offer, personalized email)
 * - A/B test campaign performance visualization
 *
 * Feature: Churn Prediction & Prevention System
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Target,
  PlayCircle,
  PauseCircle,
  Mail,
  Bell,
  Gift,
  MessageSquare,
  RefreshCw,
  Loader2,
  ChevronRight,
  Activity,
  BarChart3,
  Beaker,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Percent,
  DollarSign,
  TrendingDown as TrendingDownIcon,
  Calendar,
  Eye,
  Sparkles,
  Send,
  Unlock,
  CreditCard,
  UserCheck,
  Info,
  ArrowRight,
  Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  churnPreventionService,
  type ChurnDashboard as DashboardData,
  type ChurnRiskTier,
  type AtRiskClient,
  type Campaign,
  type CampaignStatus,
  type InterventionAction,
  type Experiment,
  type ExperimentAnalysis,
  type CampaignPerformance,
} from '../../../services/churnPreventionService';

/* =============================================================================
   Types
   ============================================================================= */

interface ChurnDashboardProps {
  workspaceId: string;
  onClientClick?: (clientId: string) => void;
  onCampaignClick?: (campaignId: string) => void;
  onExperimentClick?: (experimentId: string) => void;
  compact?: boolean;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getRiskTierConfig = (tier: ChurnRiskTier) => {
  const configs: Record<ChurnRiskTier, { label: string; color: string; bgColor: string; textColor: string }> = {
    critical: {
      label: 'Critical',
      color: 'bg-red-500',
      bgColor: 'bg-red-500/10',
      textColor: 'text-red-500',
    },
    high: {
      label: 'High',
      color: 'bg-orange-500',
      bgColor: 'bg-orange-500/10',
      textColor: 'text-orange-500',
    },
    medium: {
      label: 'Medium',
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-500/10',
      textColor: 'text-yellow-500',
    },
    low: {
      label: 'Low',
      color: 'bg-blue-400',
      bgColor: 'bg-blue-400/10',
      textColor: 'text-blue-400',
    },
    minimal: {
      label: 'Minimal',
      color: 'bg-green-500',
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-500',
    },
  };
  return configs[tier] || configs.medium;
};

const getCampaignStatusConfig = (status: CampaignStatus) => {
  const configs: Record<CampaignStatus, { label: string; color: string; icon: React.ReactNode }> = {
    draft: {
      label: 'Draft',
      color: 'text-neutral-500 bg-neutral-500/10',
      icon: <Clock size={14} />,
    },
    active: {
      label: 'Active',
      color: 'text-green-500 bg-green-500/10',
      icon: <PlayCircle size={14} />,
    },
    paused: {
      label: 'Paused',
      color: 'text-yellow-500 bg-yellow-500/10',
      icon: <PauseCircle size={14} />,
    },
    completed: {
      label: 'Completed',
      color: 'text-blue-500 bg-blue-500/10',
      icon: <CheckCircle size={14} />,
    },
    archived: {
      label: 'Archived',
      color: 'text-neutral-400 bg-neutral-400/10',
      icon: <XCircle size={14} />,
    },
  };
  return configs[status] || configs.draft;
};

const getActionTypeIcon = (actionType: string) => {
  const icons: Record<string, React.ReactNode> = {
    email: <Mail size={14} />,
    in_app_notification: <Bell size={14} />,
    push_notification: <Bell size={14} />,
    discount_offer: <Gift size={14} />,
    feature_highlight: <Zap size={14} />,
    personal_message: <MessageSquare size={14} />,
  };
  return icons[actionType] || <Mail size={14} />;
};

const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

// Map intervention recommendations to user-friendly labels and actions
const INTERVENTION_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: React.ReactNode;
  actionLabel: string;
  variant: 'primary' | 'secondary' | 'success' | 'warning';
}> = {
  special_offer: {
    label: 'Special Offer',
    description: 'Offer a discount or credit to retain the client',
    icon: <DollarSign size={16} />,
    actionLabel: 'Send Offer',
    variant: 'success',
  },
  feature_unlock: {
    label: 'Feature Unlock',
    description: 'Unlock premium features to increase engagement',
    icon: <Unlock size={16} />,
    actionLabel: 'Unlock Features',
    variant: 'primary',
  },
  credit_bonus: {
    label: 'Credit Bonus',
    description: 'Add bonus credits to the client account',
    icon: <CreditCard size={16} />,
    actionLabel: 'Add Credits',
    variant: 'success',
  },
  personal_outreach: {
    label: 'Personal Outreach',
    description: 'Schedule a personal call or meeting',
    icon: <UserCheck size={16} />,
    actionLabel: 'Schedule Call',
    variant: 'secondary',
  },
  email_campaign: {
    label: 'Engagement Email',
    description: 'Send a personalized re-engagement email',
    icon: <Mail size={16} />,
    actionLabel: 'Send Email',
    variant: 'primary',
  },
  re_engagement_gallery: {
    label: 'Re-engagement Gallery',
    description: 'Create a personalized gallery to re-engage',
    icon: <Sparkles size={16} />,
    actionLabel: 'Create Gallery',
    variant: 'primary',
  },
  gallery_highlight: {
    label: 'Gallery Highlight',
    description: 'Showcase their favorite galleries',
    icon: <Eye size={16} />,
    actionLabel: 'Highlight Gallery',
    variant: 'secondary',
  },
  in_app_prompt: {
    label: 'In-App Prompt',
    description: 'Show an in-app message or banner',
    icon: <Bell size={16} />,
    actionLabel: 'Show Prompt',
    variant: 'secondary',
  },
};

// Get intervention config with fallback
const getInterventionConfig = (intervention: string | undefined) => {
  if (!intervention) return null;
  return INTERVENTION_CONFIG[intervention] || {
    label: intervention.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: 'Recommended intervention action',
    icon: <Send size={16} />,
    actionLabel: 'Take Action',
    variant: 'secondary' as const,
  };
};

// Format churn reason from risk factors
const formatChurnReason = (factors: AtRiskClient['risk_factors']): string => {
  if (!factors || factors.length === 0) return 'Multiple risk factors detected';

  // Get the highest severity/weight factor
  const primaryFactor = factors.reduce((prev, curr) =>
    (curr.weight > prev.weight) ? curr : prev
  );

  // Map common factor types to user-friendly descriptions
  const reasonMap: Record<string, string> = {
    no_activity_30d: 'Low engagement - No activity in 30 days',
    no_activity_14d: 'Low engagement - No activity in 14 days',
    no_activity_7d: 'Declining engagement - No recent activity',
    engagement_decline_severe: 'Severe engagement decline',
    engagement_decline_moderate: 'Moderate engagement decline',
    no_gallery_views: 'No gallery views recently',
    abandoned_favorites: 'Has favorites but no downloads',
    email_unresponsive: 'Not responding to emails',
    email_bouncing: 'Email delivery issues',
    subscription_expiring_soon: 'Subscription expiring soon',
    payment_failed: 'Payment failure detected',
    downgrade_history: 'Previous downgrade - Downgrade candidate',
    declining_usage_trend: 'Declining usage trend',
    cancellation_pending: 'Cancellation scheduled',
  };

  return reasonMap[primaryFactor.factor] || primaryFactor.description;
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
  variant?: 'default' | 'warning' | 'danger' | 'success';
}> = ({ label, value, icon, trend, suffix, variant = 'default' }) => {
  const variantClasses = {
    default: 'border-border',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    danger: 'border-red-500/30 bg-red-500/5',
    success: 'border-green-500/30 bg-green-500/5',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-surface-secondary rounded-xl p-4 border ${variantClasses[variant]}`}
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
};

const RiskDistributionChart: React.FC<{
  distribution: DashboardData['risk_distribution'];
  total: number;
}> = ({ distribution, total }) => {
  const tiers: ChurnRiskTier[] = ['critical', 'high', 'medium', 'low', 'minimal'];

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-primary" />
        Risk Distribution
      </h3>
      <div className="space-y-3">
        {tiers.map((tier) => {
          const config = getRiskTierConfig(tier);
          const count = distribution[tier] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={tier} className="flex items-center gap-3">
              <div className={`w-20 text-xs font-medium ${config.textColor}`}>
                {config.label}
              </div>
              <div className="flex-1">
                <div className="h-4 bg-surface-tertiary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${config.color}`}
                  />
                </div>
              </div>
              <div className="w-12 text-right text-sm font-medium text-text-primary">
                {count}
              </div>
              <div className="w-12 text-right text-xs text-text-tertiary">
                {percentage.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Enhanced At-Risk Client Card with churn probability and predicted reason
 */
const AtRiskClientCard: React.FC<{
  client: AtRiskClient;
  onClientClick?: (clientId: string) => void;
  onTriggerIntervention?: (clientId: string, intervention: string) => void;
  expanded?: boolean;
}> = ({ client, onClientClick, onTriggerIntervention, expanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const tierConfig = getRiskTierConfig(client.risk_tier);
  const interventionConfig = getInterventionConfig(client.intervention_recommended);
  const churnReason = formatChurnReason(client.risk_factors);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border transition-all ${
        client.requires_immediate_action
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-border bg-surface-tertiary/50'
      }`}
    >
      {/* Header Row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-tertiary/50 transition-colors rounded-xl"
      >
        {/* Risk Score Circle */}
        <div className="relative">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${tierConfig.bgColor} ${tierConfig.textColor}`}>
            {Math.round(client.risk_score)}
          </div>
          {client.requires_immediate_action && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <Zap size={10} className="text-white" />
            </div>
          )}
        </div>

        {/* Client Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary truncate">
              {client.client_name}
            </p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierConfig.bgColor} ${tierConfig.textColor}`}>
              {tierConfig.label}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
            <AlertTriangle size={10} className="text-amber-500" />
            {churnReason}
          </p>
        </div>

        {/* Churn Probability */}
        <div className="text-right">
          <p className="text-xs text-text-tertiary">Churn Probability</p>
          <p className={`text-lg font-bold ${
            client.risk_score >= 80 ? 'text-red-500' :
            client.risk_score >= 60 ? 'text-orange-500' :
            'text-yellow-500'
          }`}>
            {client.risk_score}%
          </p>
        </div>

        <ChevronRight
          size={16}
          className={`text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Divider */}
              <div className="border-t border-border" />

              {/* Risk Factors */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
                  <Info size={12} />
                  Risk Factors ({client.risk_factors.length})
                </p>
                <div className="space-y-1.5">
                  {client.risk_factors.slice(0, 4).map((factor, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        factor.severity === 'high' ? 'bg-red-500' :
                        factor.severity === 'medium' ? 'bg-orange-500' :
                        'bg-yellow-500'
                      }`} />
                      <span className="text-text-secondary">{factor.description}</span>
                      <span className="text-text-tertiary ml-auto">
                        +{factor.weight}pts
                      </span>
                    </div>
                  ))}
                  {client.risk_factors.length > 4 && (
                    <p className="text-xs text-text-tertiary pl-3.5">
                      +{client.risk_factors.length - 4} more factors
                    </p>
                  )}
                </div>
              </div>

              {/* Activity Info */}
              {client.days_since_last_activity !== undefined && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-text-tertiary" />
                    <span className="text-text-secondary">
                      {client.days_since_last_activity} days since last activity
                    </span>
                  </div>
                  {client.intervention_count > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Send size={12} className="text-text-tertiary" />
                      <span className="text-text-secondary">
                        {client.intervention_count} prior interventions
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Intervention */}
              {interventionConfig && (
                <div className="bg-surface-secondary rounded-lg p-3 border border-border">
                  <p className="text-xs font-medium text-text-secondary mb-2">
                    Suggested Intervention
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        interventionConfig.variant === 'success' ? 'bg-green-500/10 text-green-500' :
                        interventionConfig.variant === 'primary' ? 'bg-primary/10 text-primary' :
                        interventionConfig.variant === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-neutral-500/10 text-neutral-500'
                      }`}>
                        {interventionConfig.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {interventionConfig.label}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {interventionConfig.description}
                        </p>
                      </div>
                    </div>
                    <AppButton
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerIntervention?.(client.client_id, client.intervention_recommended || '');
                      }}
                    >
                      {interventionConfig.actionLabel}
                    </AppButton>
                  </div>
                </div>
              )}

              {/* View Client Button */}
              <AppButton
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => onClientClick?.(client.client_id)}
                rightIcon={<ArrowRight size={14} />}
              >
                View Client Details
              </AppButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/**
 * Enhanced At-Risk Clients List
 */
const AtRiskClientsList: React.FC<{
  clients: AtRiskClient[];
  onClientClick?: (clientId: string) => void;
  onTriggerIntervention?: (clientId: string, intervention: string) => void;
}> = ({ clients, onClientClick, onTriggerIntervention }) => {
  if (clients.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          At-Risk Clients
        </h3>
        <div className="text-center py-6">
          <Shield size={32} className="mx-auto mb-2 text-green-500 opacity-50" />
          <p className="text-text-tertiary text-sm">No clients at critical risk</p>
          <p className="text-text-tertiary text-xs mt-1">All clients are healthy!</p>
        </div>
      </div>
    );
  }

  // Separate critical clients for immediate attention
  const criticalClients = clients.filter(c => c.requires_immediate_action || c.risk_tier === 'critical');
  const otherClients = clients.filter(c => !c.requires_immediate_action && c.risk_tier !== 'critical');

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          At-Risk Clients
        </h3>
        <div className="flex items-center gap-2">
          {criticalClients.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
              {criticalClients.length} urgent
            </span>
          )}
          <span className="text-xs text-text-tertiary">
            {clients.length} total
          </span>
        </div>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {/* Critical/Urgent Clients - Expanded by default */}
        {criticalClients.map((client, idx) => (
          <AtRiskClientCard
            key={client.client_id}
            client={client}
            onClientClick={onClientClick}
            onTriggerIntervention={onTriggerIntervention}
            expanded={idx === 0} // First critical client expanded
          />
        ))}

        {/* Other At-Risk Clients */}
        {otherClients.map((client) => (
          <AtRiskClientCard
            key={client.client_id}
            client={client}
            onClientClick={onClientClick}
            onTriggerIntervention={onTriggerIntervention}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Enhanced Active Campaigns List with Performance Metrics
 */
const ActiveCampaignsList: React.FC<{
  campaigns: Campaign[];
  workspaceId: string;
  onCampaignClick?: (campaignId: string) => void;
}> = ({ campaigns, workspaceId, onCampaignClick }) => {
  const [performanceData, setPerformanceData] = useState<Record<string, CampaignPerformance>>({});
  const [loadingPerformance, setLoadingPerformance] = useState<string | null>(null);

  const loadPerformance = async (campaignId: string) => {
    if (performanceData[campaignId]) return;

    setLoadingPerformance(campaignId);
    try {
      const performance = await churnPreventionService.getCampaignPerformance(workspaceId, campaignId);
      setPerformanceData(prev => ({ ...prev, [campaignId]: performance }));
    } catch (error) {
      console.error('Failed to load campaign performance:', error);
    } finally {
      setLoadingPerformance(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Target size={16} className="text-primary" />
          Active Campaigns
        </h3>
        <div className="text-center py-6">
          <Target size={32} className="mx-auto mb-2 text-text-tertiary opacity-50" />
          <p className="text-text-tertiary text-sm">No active campaigns</p>
          <p className="text-text-tertiary text-xs mt-1">Create a campaign to start preventing churn</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Target size={16} className="text-primary" />
        Active Campaigns
        <span className="ml-auto text-xs text-text-tertiary">{campaigns.length} campaigns</span>
      </h3>
      <div className="space-y-2">
        {campaigns.slice(0, 5).map((campaign) => {
          const statusConfig = getCampaignStatusConfig(campaign.status);
          const performance = performanceData[campaign.campaign_id];
          const isLoading = loadingPerformance === campaign.campaign_id;

          return (
            <motion.div
              key={campaign.campaign_id}
              onHoverStart={() => loadPerformance(campaign.campaign_id)}
              className="rounded-lg border border-border overflow-hidden"
            >
              <button
                onClick={() => onCampaignClick?.(campaign.campaign_id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-surface-tertiary transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {getActionTypeIcon(campaign.actions[0]?.action_type || 'email')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {campaign.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Targeting: {campaign.target_risk_tiers.map((t) => getRiskTierConfig(t).label).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${statusConfig.color}`}>
                    {statusConfig.icon}
                    {statusConfig.label}
                  </span>
                  <ChevronRight size={16} className="text-text-tertiary" />
                </div>
              </button>

              {/* Performance Preview on Hover */}
              {(performance || isLoading) && (
                <div className="px-3 pb-3 pt-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 size={14} className="animate-spin text-text-tertiary" />
                    </div>
                  ) : performance && (
                    <div className="flex items-center gap-4 text-xs text-text-tertiary border-t border-border pt-2">
                      <div className="flex items-center gap-1">
                        <Send size={10} />
                        <span>{performance.interventions_sent} sent</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye size={10} />
                        <span>{(performance.open_rate * 100).toFixed(0)}% open</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle size={10} className="text-green-500" />
                        <span className="text-green-500">
                          {(performance.conversion_rate * 100).toFixed(1)}% converted
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const RecentInterventionsList: React.FC<{
  interventions: InterventionAction[];
  onClientClick?: (clientId: string) => void;
}> = ({ interventions, onClientClick }) => {
  if (interventions.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Activity size={16} className="text-blue-500" />
          Recent Interventions
        </h3>
        <p className="text-text-tertiary text-sm text-center py-4">
          No recent interventions
        </p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      delivered: 'text-blue-500 bg-blue-500/10',
      opened: 'text-green-500 bg-green-500/10',
      clicked: 'text-green-600 bg-green-600/10',
      converted: 'text-amber-500 bg-amber-500/10',
      failed: 'text-red-500 bg-red-500/10',
      pending: 'text-neutral-500 bg-neutral-500/10',
    };
    return colors[status] || colors.pending;
  };

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Activity size={16} className="text-blue-500" />
        Recent Interventions
        <span className="ml-auto text-xs text-text-tertiary">{interventions.length} recent</span>
      </h3>
      <div className="space-y-2">
        {interventions.slice(0, 5).map((intervention) => (
          <motion.button
            key={intervention.intervention_id}
            onClick={() => onClientClick?.(intervention.client_id)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-tertiary transition-colors text-left"
            whileHover={{ x: 4 }}
          >
            <div className="w-8 h-8 rounded-full bg-surface-tertiary flex items-center justify-center text-text-secondary">
              {getActionTypeIcon(intervention.action_type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {intervention.client_name}
              </p>
              <p className="text-xs text-text-tertiary">
                {intervention.campaign_name}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(intervention.delivery_status)}`}>
              {intervention.delivery_status}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

/**
 * Enhanced A/B Experiments List with Performance Visualization
 */
const RunningExperimentsList: React.FC<{
  experiments: Experiment[];
  workspaceId: string;
  onExperimentClick?: (experimentId: string) => void;
}> = ({ experiments, workspaceId, onExperimentClick }) => {
  const [expandedExperiment, setExpandedExperiment] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<Record<string, ExperimentAnalysis>>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState<string | null>(null);

  const loadAnalysis = async (experimentId: string) => {
    if (analysisData[experimentId]) {
      setExpandedExperiment(expandedExperiment === experimentId ? null : experimentId);
      return;
    }

    setLoadingAnalysis(experimentId);
    try {
      const analysis = await churnPreventionService.analyzeExperiment(workspaceId, experimentId);
      setAnalysisData(prev => ({ ...prev, [experimentId]: analysis }));
      setExpandedExperiment(experimentId);
    } catch (error) {
      console.error('Failed to load experiment analysis:', error);
    } finally {
      setLoadingAnalysis(null);
    }
  };

  if (experiments.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Beaker size={16} className="text-purple-500" />
          A/B Test Campaigns
        </h3>
        <div className="text-center py-4">
          <Beaker size={32} className="mx-auto mb-2 text-text-tertiary opacity-50" />
          <p className="text-text-tertiary text-sm">No running experiments</p>
          <p className="text-text-tertiary text-xs mt-1">
            Create an experiment to optimize interventions
          </p>
        </div>
      </div>
    );
  }

  const getExperimentProgress = (exp: Experiment) => {
    const totalSamples = exp.variants.reduce((sum, v) => sum + v.sample_size, 0);
    return Math.min((totalSamples / exp.target_sample_size) * 100, 100);
  };

  const getStatusColor = (status: Experiment['status']) => {
    const colors = {
      running: 'text-green-500 bg-green-500/10',
      paused: 'text-yellow-500 bg-yellow-500/10',
      concluded: 'text-blue-500 bg-blue-500/10',
      draft: 'text-neutral-500 bg-neutral-500/10',
    };
    return colors[status] || colors.draft;
  };

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Beaker size={16} className="text-purple-500" />
          A/B Test Campaigns
        </h3>
        <span className="text-xs text-text-tertiary">
          {experiments.filter(e => e.status === 'running').length} active
        </span>
      </div>

      <div className="space-y-3">
        {experiments.slice(0, 5).map((experiment) => {
          const progress = getExperimentProgress(experiment);
          const isExpanded = expandedExperiment === experiment.experiment_id;
          const analysis = analysisData[experiment.experiment_id];
          const isLoading = loadingAnalysis === experiment.experiment_id;

          return (
            <div
              key={experiment.experiment_id}
              className="rounded-lg border border-border overflow-hidden"
            >
              {/* Experiment Header */}
              <button
                onClick={() => loadAnalysis(experiment.experiment_id)}
                className="w-full p-3 hover:bg-surface-tertiary transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {experiment.name}
                    </p>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(experiment.status)}`}>
                      {experiment.status}
                    </span>
                  </div>
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin text-text-tertiary" />
                  ) : (
                    <ChevronRight
                      size={14}
                      className={`text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  )}
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                      className={`h-full rounded-full ${
                        progress >= 100 ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                    />
                  </div>
                  <span className="text-xs text-text-tertiary w-12 text-right">
                    {progress.toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                  <span>{experiment.variants.length} variants</span>
                  <span>•</span>
                  <span>
                    {experiment.variants.reduce((sum, v) => sum + v.sample_size, 0)} / {experiment.target_sample_size} samples
                  </span>
                </div>
              </button>

              {/* Expanded Analysis */}
              <AnimatePresence>
                {isExpanded && analysis && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border"
                  >
                    <div className="p-3 bg-surface-tertiary/30">
                      {/* Statistical Significance */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary">Statistical Significance:</span>
                          <span className={`text-xs font-medium ${
                            analysis.is_significant ? 'text-green-500' : 'text-amber-500'
                          }`}>
                            {(analysis.statistical_significance * 100).toFixed(1)}%
                          </span>
                        </div>
                        {analysis.is_significant && (
                          <span className="flex items-center gap-1 text-xs text-green-500">
                            <CheckCircle size={12} />
                            Significant
                          </span>
                        )}
                      </div>

                      {/* Variant Performance Comparison */}
                      <div className="space-y-2">
                        {analysis.variants.map((variant) => {
                          const isWinner = analysis.recommended_winner === variant.variant_id;
                          const barWidth = Math.max(variant.conversion_rate * 100 * 10, 5); // Scale for visibility

                          return (
                            <div key={variant.variant_id} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${
                                    variant.is_control ? 'text-text-secondary' : 'text-text-primary'
                                  }`}>
                                    {variant.variant_name}
                                    {variant.is_control && (
                                      <span className="text-text-tertiary ml-1">(Control)</span>
                                    )}
                                  </span>
                                  {isWinner && (
                                    <Award size={12} className="text-amber-500" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-text-primary font-medium">
                                    {(variant.conversion_rate * 100).toFixed(1)}%
                                  </span>
                                  {variant.relative_improvement !== undefined && !variant.is_control && (
                                    <span className={`text-xs ${
                                      variant.relative_improvement > 0 ? 'text-green-500' : 'text-red-500'
                                    }`}>
                                      {variant.relative_improvement > 0 ? '+' : ''}
                                      {(variant.relative_improvement * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(barWidth, 100)}%` }}
                                  className={`h-full rounded-full ${
                                    isWinner ? 'bg-amber-500' :
                                    variant.is_control ? 'bg-neutral-400' : 'bg-purple-500'
                                  }`}
                                />
                              </div>
                              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                                <span>{variant.sample_size} samples</span>
                                <span>•</span>
                                <span>{variant.conversions} conversions</span>
                                {variant.p_value !== undefined && (
                                  <>
                                    <span>•</span>
                                    <span>p-value: {variant.p_value.toFixed(3)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Winner Recommendation */}
                      {analysis.recommended_winner && (
                        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Award size={12} />
                            <span className="font-medium">Recommended Winner:</span>
                            <span>
                              {analysis.variants.find(v => v.variant_id === analysis.recommended_winner)?.variant_name}
                            </span>
                          </p>
                        </div>
                      )}

                      {/* View Details Button */}
                      <AppButton
                        variant="ghost"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => onExperimentClick?.(experiment.experiment_id)}
                        rightIcon={<ArrowRight size={14} />}
                      >
                        View Full Analysis
                      </AppButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const ChurnDashboard: React.FC<ChurnDashboardProps> = ({
  workspaceId,
  onClientClick,
  onCampaignClick,
  onExperimentClick,
  compact = false,
}) => {
  const { addToast } = useToast();

  // State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeringIntervention, setTriggeringIntervention] = useState<string | null>(null);

  // Fetch dashboard data
  const fetchDashboard = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await churnPreventionService.getDashboard(workspaceId);
        setDashboardData(data);
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to load churn data',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, addToast]
  );

  // Handle intervention trigger
  const handleTriggerIntervention = useCallback(
    async (clientId: string, intervention: string) => {
      if (triggeringIntervention) return;

      setTriggeringIntervention(clientId);
      try {
        // Get active campaigns matching the intervention type
        const { campaigns } = await churnPreventionService.listCampaigns(workspaceId, {
          status: 'active',
        });

        // Find a matching campaign or use the first active one
        const campaign = campaigns.find(c =>
          c.campaign_type === intervention ||
          c.campaign_type === 'special_offer' ||
          c.campaign_type === 'email_sequence'
        ) || campaigns[0];

        if (!campaign) {
          addToast({
            variant: 'warning',
            message: 'No active campaigns available. Please create a campaign first.',
          });
          return;
        }

        await churnPreventionService.triggerIntervention(workspaceId, clientId, {
          campaign_id: campaign.campaign_id,
          reason: `Manual intervention: ${intervention}`,
        });

        addToast({
          variant: 'success',
          message: 'Intervention triggered successfully!',
        });

        // Refresh dashboard data
        fetchDashboard(true);
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to trigger intervention',
        });
      } finally {
        setTriggeringIntervention(null);
      }
    },
    [workspaceId, triggeringIntervention, addToast, fetchDashboard]
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
        <Shield size={48} className="mx-auto mb-4 opacity-50" />
        <p>Failed to load churn prevention data</p>
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

  const { summary, risk_distribution, at_risk_clients, active_campaigns, recent_interventions, running_experiments } = dashboardData;
  const totalClients = summary.total_clients;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            Churn Prevention
          </h2>
          <p className="text-sm text-text-tertiary">
            Identify at-risk clients and run intervention campaigns
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
          label="Total Clients"
          value={summary.total_clients}
          icon={<Users size={20} />}
        />
        <StatCard
          label="At Risk"
          value={summary.at_risk_clients}
          icon={<AlertTriangle size={20} className="text-amber-500" />}
          variant={summary.at_risk_clients > 10 ? 'warning' : 'default'}
        />
        <StatCard
          label="Critical Risk"
          value={summary.critical_risk_clients}
          icon={<AlertTriangle size={20} className="text-red-500" />}
          variant={summary.critical_risk_clients > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Retention Rate"
          value={formatPercentage(summary.retention_rate)}
          icon={<TrendingUp size={20} className="text-green-500" />}
          variant={summary.retention_rate >= 0.9 ? 'success' : 'default'}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Campaigns"
          value={summary.active_campaigns}
          icon={<Target size={20} className="text-primary" />}
        />
        <StatCard
          label="Interventions (30d)"
          value={summary.interventions_this_month}
          icon={<Activity size={20} className="text-blue-500" />}
        />
        <StatCard
          label="Churn Rate"
          value={formatPercentage(summary.churn_rate)}
          icon={<TrendingDown size={20} className="text-red-500" />}
          variant={summary.churn_rate > 0.1 ? 'danger' : 'default'}
        />
        <StatCard
          label="Avg Risk Score"
          value={summary.avg_risk_score.toFixed(1)}
          icon={<BarChart3 size={20} />}
        />
      </div>

      {/* Main Content */}
      {compact ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AtRiskClientsList
            clients={at_risk_clients}
            onClientClick={onClientClick}
            onTriggerIntervention={handleTriggerIntervention}
          />
          <ActiveCampaignsList
            campaigns={active_campaigns}
            workspaceId={workspaceId}
            onCampaignClick={onCampaignClick}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Risk Overview & A/B Tests */}
          <div className="space-y-4">
            <RiskDistributionChart
              distribution={risk_distribution}
              total={totalClients}
            />
            <RunningExperimentsList
              experiments={running_experiments}
              workspaceId={workspaceId}
              onExperimentClick={onExperimentClick}
            />
          </div>

          {/* Middle Column - At-Risk Clients (Enhanced) */}
          <div className="space-y-4">
            <AtRiskClientsList
              clients={at_risk_clients}
              onClientClick={onClientClick}
              onTriggerIntervention={handleTriggerIntervention}
            />
          </div>

          {/* Right Column - Campaigns & Recent Activity */}
          <div className="space-y-4">
            <ActiveCampaignsList
              campaigns={active_campaigns}
              workspaceId={workspaceId}
              onCampaignClick={onCampaignClick}
            />
            <RecentInterventionsList
              interventions={recent_interventions}
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

export default ChurnDashboard;
