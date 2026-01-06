/**
 * ClientEngagementCard Component
 *
 * Displays engagement score and details for a single client.
 * Shows score breakdown, trend, predictions, and recommendations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Target,
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Activity,
  Heart,
  Download,
  Mail,
  Flame,
  Snowflake,
  Sun,
  Star,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  engagementService,
  type EngagementScore,
  type PredictiveScore,
  type Recommendation,
  type ScoreTier,
  type ScoreTrend,
} from '../../../services/engagementService';

/* =============================================================================
   Types
   ============================================================================= */

interface ClientEngagementCardProps {
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onRefresh?: () => void;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getTierConfig = (tier: ScoreTier) => {
  const configs: Record<ScoreTier, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
    champion: {
      label: 'Champion',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: <Star size={16} className="text-amber-500" />,
    },
    hot: {
      label: 'Hot',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10 border-red-500/20',
      icon: <Flame size={16} className="text-red-500" />,
    },
    warm: {
      label: 'Warm',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10 border-orange-500/20',
      icon: <Sun size={16} className="text-orange-500" />,
    },
    cool: {
      label: 'Cool',
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10 border-blue-400/20',
      icon: <Snowflake size={16} className="text-blue-400" />,
    },
    cold: {
      label: 'Cold',
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10 border-blue-600/20',
      icon: <Snowflake size={16} className="text-blue-600" />,
    },
    at_risk: {
      label: 'At Risk',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10 border-yellow-500/20',
      icon: <AlertTriangle size={16} className="text-yellow-500" />,
    },
    churned: {
      label: 'Churned',
      color: 'text-neutral-500',
      bgColor: 'bg-neutral-500/10 border-neutral-500/20',
      icon: <TrendingDown size={16} className="text-neutral-500" />,
    },
  };
  return configs[tier] || configs.cold;
};

const getTrendIcon = (trend: ScoreTrend) => {
  switch (trend) {
    case 'rising':
      return <TrendingUp size={14} className="text-green-500" />;
    case 'declining':
      return <TrendingDown size={14} className="text-red-500" />;
    default:
      return <Minus size={14} className="text-neutral-500" />;
  }
};

const getScoreColor = (score: number) => {
  if (score >= 75) return 'text-green-500';
  if (score >= 50) return 'text-orange-500';
  if (score >= 25) return 'text-yellow-500';
  return 'text-red-500';
};

const getProgressColor = (score: number) => {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 25) return 'bg-yellow-500';
  return 'bg-red-500';
};

/* =============================================================================
   Sub Components
   ============================================================================= */

const ScoreGauge: React.FC<{ score: number; tier: ScoreTier }> = ({ score, tier }) => {
  const tierConfig = getTierConfig(tier);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="45"
          fill="none"
          stroke="currentColor"
          className="text-surface-tertiary"
          strokeWidth="8"
        />
        <motion.circle
          cx="64"
          cy="64"
          r="45"
          fill="none"
          stroke="currentColor"
          className={getScoreColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>
          {Math.round(score)}
        </span>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${tierConfig.bgColor} border`}>
          {tierConfig.icon}
          <span className={`text-xs font-medium ${tierConfig.color}`}>
            {tierConfig.label}
          </span>
        </div>
      </div>
    </div>
  );
};

const ComponentScore: React.FC<{
  label: string;
  score: number;
  icon: React.ReactNode;
}> = ({ label, score, icon }) => (
  <div className="flex items-center gap-2">
    <span className="text-text-tertiary">{icon}</span>
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-medium text-text-primary">{Math.round(score)}</span>
      </div>
      <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${getProgressColor(score)}`}
        />
      </div>
    </div>
  </div>
);

const PredictionBadge: React.FC<{
  label: string;
  score: number;
  type: 'intent' | 'risk';
}> = ({ label, score, type }) => {
  const isHighScore = score >= 60;
  const bgColor = type === 'intent'
    ? (isHighScore ? 'bg-green-500/10' : 'bg-surface-tertiary')
    : (isHighScore ? 'bg-red-500/10' : 'bg-surface-tertiary');
  const textColor = type === 'intent'
    ? (isHighScore ? 'text-green-500' : 'text-text-tertiary')
    : (isHighScore ? 'text-red-500' : 'text-text-tertiary');
  const Icon = type === 'intent' ? Target : AlertTriangle;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bgColor}`}>
      <Icon size={16} className={textColor} />
      <div>
        <p className="text-xs text-text-tertiary">{label}</p>
        <p className={`text-sm font-semibold ${textColor}`}>{Math.round(score)}%</p>
      </div>
    </div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const ClientEngagementCard: React.FC<ClientEngagementCardProps> = ({
  workspaceId,
  clientId,
  clientName,
  onRefresh,
}) => {
  const { addToast } = useToast();

  // State
  const [score, setScore] = useState<EngagementScore | null>(null);
  const [predictions, setPredictions] = useState<PredictiveScore | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch all data
  const fetchData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [scoreData, predictionsData, recommendationsData] = await Promise.all([
          engagementService.getClientScore(workspaceId, clientId),
          engagementService.getClientPredictions(workspaceId, clientId),
          engagementService.getClientRecommendations(workspaceId, clientId, 'pending', 3),
        ]);

        setScore(scoreData);
        setPredictions(predictionsData);
        setRecommendations(recommendationsData);
      } catch (error) {
        // Score might not exist yet - that's okay
        console.warn('Failed to load engagement data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, clientId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle recalculate
  const handleRecalculate = async () => {
    setRefreshing(true);
    try {
      const newScore = await engagementService.recalculateClientScore(workspaceId, clientId);
      setScore(newScore);
      addToast({
        variant: 'success',
        message: 'Engagement score recalculated',
      });
      onRefresh?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: 'Failed to recalculate score',
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Handle generate recommendations
  const handleGenerateRecommendations = async () => {
    try {
      const newRecs = await engagementService.generateRecommendations(workspaceId, clientId);
      setRecommendations(newRecs);
      addToast({
        variant: 'success',
        message: `Generated ${newRecs.length} recommendations`,
      });
    } catch (error) {
      addToast({
        variant: 'error',
        message: 'Failed to generate recommendations',
      });
    }
  };

  if (loading) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <div className="text-center py-6">
          <Activity size={32} className="mx-auto mb-2 text-text-tertiary opacity-50" />
          <p className="text-sm text-text-tertiary mb-3">
            No engagement data yet
          </p>
          <AppButton
            variant="secondary"
            size="sm"
            onClick={handleRecalculate}
            disabled={refreshing}
            leftIcon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
          >
            Calculate Score
          </AppButton>
        </div>
      </div>
    );
  }

  const tierConfig = getTierConfig(score.score_tier);

  return (
    <div className="bg-surface-secondary rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              Engagement Score
            </h3>
            {clientName && (
              <p className="text-xs text-text-tertiary">{clientName}</p>
            )}
          </div>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleRecalculate}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </AppButton>
        </div>

        {/* Score Display */}
        <div className="flex items-center gap-6">
          <ScoreGauge score={score.total_score} tier={score.score_tier} />

          <div className="flex-1 space-y-3">
            {/* Trend */}
            <div className="flex items-center gap-2 text-sm">
              {getTrendIcon(score.trend.direction as ScoreTrend)}
              <span className="text-text-secondary capitalize">
                {score.trend.direction}
              </span>
              {score.trend.velocity !== 0 && (
                <span className="text-text-tertiary">
                  ({score.trend.velocity > 0 ? '+' : ''}{score.trend.velocity.toFixed(1)})
                </span>
              )}
            </div>

            {/* Predictions */}
            {predictions && (
              <div className="flex gap-2">
                <PredictionBadge
                  label="Intent"
                  score={predictions.high_intent.score}
                  type="intent"
                />
                <PredictionBadge
                  label="Risk"
                  score={predictions.churn_risk.score}
                  type="risk"
                />
              </div>
            )}

            {/* Activity */}
            <div className="flex gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {score.metrics.days_since_last_activity !== null
                  ? `${score.metrics.days_since_last_activity}d ago`
                  : 'No activity'}
              </span>
              <span className="flex items-center gap-1">
                <Activity size={12} />
                {score.metrics.interactions_30d} in 30d
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between border-t border-border hover:bg-surface-tertiary transition-colors"
      >
        <span className="text-xs text-text-tertiary">
          {expanded ? 'Hide details' : 'Show details'}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-text-tertiary" />
        ) : (
          <ChevronDown size={14} className="text-text-tertiary" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-border space-y-4">
              {/* Component Scores */}
              <div>
                <h4 className="text-xs font-medium text-text-secondary mb-3">
                  Score Breakdown
                </h4>
                <div className="space-y-2">
                  <ComponentScore
                    label="Activity"
                    score={score.components.activity}
                    icon={<Activity size={14} />}
                  />
                  <ComponentScore
                    label="Engagement"
                    score={score.components.engagement_depth}
                    icon={<Clock size={14} />}
                  />
                  <ComponentScore
                    label="Conversion"
                    score={score.components.conversion}
                    icon={<Download size={14} />}
                  />
                  <ComponentScore
                    label="Responsiveness"
                    score={score.components.responsiveness}
                    icon={<Mail size={14} />}
                  />
                  <ComponentScore
                    label="Loyalty"
                    score={score.components.loyalty}
                    icon={<Heart size={14} />}
                  />
                </div>
              </div>

              {/* Intent Signals */}
              {predictions && predictions.high_intent.signals.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
                    <Target size={12} className="text-green-500" />
                    High-Intent Signals
                  </h4>
                  <div className="space-y-1">
                    {predictions.high_intent.signals.map((signal, i) => (
                      <p key={i} className="text-xs text-text-tertiary flex items-center gap-1">
                        <Zap size={10} className="text-green-500" />
                        {signal.description}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Factors */}
              {predictions && predictions.churn_risk.factors.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} className="text-amber-500" />
                    Risk Factors
                  </h4>
                  <div className="space-y-1">
                    {predictions.churn_risk.factors.map((factor, i) => (
                      <p key={i} className="text-xs text-text-tertiary flex items-center gap-1">
                        <AlertTriangle size={10} className={
                          factor.severity === 'high' ? 'text-red-500' :
                          factor.severity === 'medium' ? 'text-amber-500' : 'text-yellow-500'
                        } />
                        {factor.description}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
                    <Sparkles size={12} className="text-primary" />
                    Recommendations
                  </h4>
                  <div className="space-y-2">
                    {recommendations.map((rec) => (
                      <div
                        key={rec.recommendation_id}
                        className="text-xs bg-surface-tertiary rounded p-2"
                      >
                        <p className="font-medium text-text-primary capitalize">
                          {rec.recommendation_type.replace(/_/g, ' ')}
                        </p>
                        {rec.subject_suggestion && (
                          <p className="text-text-tertiary mt-0.5">
                            {rec.subject_suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <AppButton
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateRecommendations}
                  leftIcon={<Sparkles size={14} />}
                >
                  Generate Recommendations
                </AppButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClientEngagementCard;
