/**
 * Recommendation Card Component
 *
 * Displays a single recommendation with items, actions, and feedback options.
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Image,
  Users,
  Calendar,
  Star,
  ChevronRight,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Download,
  Heart,
  Loader2,
  MoreHorizontal,
  Check,
  X,
  Clock,
  Share,
  Briefcase,
  BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useSubmitFeedback } from '../../../hooks/usePortfolioRecommendations';
import type {
  Recommendation,
  RecommendationItem,
  RecommendationType,
  RecommendationStatus,
  SceneCategory,
} from '../../../services/portfolioRecommendationService';

/* =============================================================================
   Types
   ============================================================================= */

interface RecommendationCardProps {
  workspaceId: string;
  recommendation: Recommendation;
  onAssetClick?: (assetId: string) => void;
  onAccept?: (recommendationId: string) => void;
  onReject?: (recommendationId: string) => void;
  onViewDetails?: (recommendationId: string) => void;
  showItems?: boolean;
  maxItems?: number;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getTypeConfig = (type: RecommendationType) => {
  const configs: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    hero_shots: {
      label: 'Hero Shots',
      icon: <Star size={14} />,
      color: 'text-amber-500 bg-amber-500/10',
    },
    similar_style: {
      label: 'Similar Style',
      icon: <Sparkles size={14} />,
      color: 'text-purple-500 bg-purple-500/10',
    },
    personalized: {
      label: 'Personalized',
      icon: <Users size={14} />,
      color: 'text-blue-500 bg-blue-500/10',
    },
    seasonal_picks: {
      label: 'Seasonal',
      icon: <Calendar size={14} />,
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    trending_shots: {
      label: 'Trending',
      icon: <Star size={14} />,
      color: 'text-rose-500 bg-rose-500/10',
    },
    quick_delivery: {
      label: 'Quick Delivery',
      icon: <Clock size={14} />,
      color: 'text-cyan-500 bg-cyan-500/10',
    },
    social_media: {
      label: 'Social Media',
      icon: <Share size={14} />,
      color: 'text-pink-500 bg-pink-500/10',
    },
    portfolio_selection: {
      label: 'Portfolio',
      icon: <Briefcase size={14} />,
      color: 'text-indigo-500 bg-indigo-500/10',
    },
    print_worthy: {
      label: 'Print Worthy',
      icon: <Image size={14} />,
      color: 'text-orange-500 bg-orange-500/10',
    },
    album_cover: {
      label: 'Album Cover',
      icon: <BookOpen size={14} />,
      color: 'text-violet-500 bg-violet-500/10',
    },
  };
  return configs[type] || configs.hero_shots;
};

const getStatusConfig = (status: RecommendationStatus) => {
  const configs: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    pending: {
      label: 'Pending',
      icon: <Clock size={14} />,
      color: 'text-neutral-500 bg-neutral-500/10',
    },
    accepted: {
      label: 'Accepted',
      icon: <Check size={14} />,
      color: 'text-green-500 bg-green-500/10',
    },
    rejected: {
      label: 'Rejected',
      icon: <X size={14} />,
      color: 'text-red-500 bg-red-500/10',
    },
    partial: {
      label: 'Partial',
      icon: <MoreHorizontal size={14} />,
      color: 'text-yellow-500 bg-yellow-500/10',
    },
  };
  return configs[status] || configs.pending;
};

const getSceneCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    ceremony: 'Ceremony',
    reception: 'Reception',
    portrait: 'Portrait',
    detail: 'Detail',
    candid: 'Candid',
    landscape: 'Landscape',
    group: 'Group',
    couple: 'Couple',
    family: 'Family',
    food: 'Food',
    venue: 'Venue',
    wedding: 'Wedding',
    event: 'Event',
    product: 'Product',
    lifestyle: 'Lifestyle',
    corporate: 'Corporate',
    nature: 'Nature',
    architecture: 'Architecture',
    fashion: 'Fashion',
    sports: 'Sports',
    other: 'Other',
  };
  return labels[category] || 'Other';
};

const formatConfidence = (confidence: number): string => {
  return `${Math.round(confidence * 100)}%`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* =============================================================================
   Sub Components
   ============================================================================= */

const RecommendationItemCard: React.FC<{
  item: RecommendationItem;
  rank: number;
  onAssetClick?: (assetId: string) => void;
}> = ({ item, rank, onAssetClick }) => {
  return (
    <motion.button
      onClick={() => onAssetClick?.(item.asset_id)}
      className="relative group rounded-lg overflow-hidden aspect-square bg-surface-tertiary"
      whileHover={{ scale: 1.02 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: rank * 0.03 }}
    >
      {item.thumbnail_url ? (
        <img
          src={item.thumbnail_url}
          alt={`Recommendation ${rank}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Image size={20} className="text-text-tertiary" />
        </div>
      )}

      {/* Rank badge */}
      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
        {rank}
      </div>

      {/* Score badge */}
      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-xs font-medium">
        {formatConfidence(item.final_score / 100)}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-2 left-2 right-2">
          {item.reason && (
            <p className="text-white text-xs line-clamp-2 mb-1">{item.reason}</p>
          )}
          <div className="flex gap-2 text-white/80 text-xs">
            {item.scene_category && (
              <span className="px-1.5 py-0.5 rounded bg-white/20">
                {getSceneCategoryLabel(item.scene_category)}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
};

const FeedbackButtons: React.FC<{
  workspaceId: string;
  recommendationId: string;
  currentStatus: RecommendationStatus;
  onSuccess?: () => void;
}> = ({ workspaceId, recommendationId, currentStatus, onSuccess }) => {
  const { mutate: submitFeedback, isPending } = useSubmitFeedback(workspaceId, recommendationId);

  const handleFeedback = useCallback(
    (rating: 'positive' | 'negative') => {
      submitFeedback(
        { feedback_type: 'rating', rating: rating === 'positive' ? 5 : 1 },
        { onSuccess }
      );
    },
    [submitFeedback, onSuccess]
  );

  if (currentStatus !== 'pending') {
    return null;
  }

  return (
    <div className="flex gap-2">
      <AppButton
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('positive')}
        disabled={isPending}
        className="text-green-500 hover:bg-green-500/10"
      >
        {isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ThumbsUp size={14} />
        )}
      </AppButton>
      <AppButton
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('negative')}
        disabled={isPending}
        className="text-red-500 hover:bg-red-500/10"
      >
        {isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ThumbsDown size={14} />
        )}
      </AppButton>
    </div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  workspaceId,
  recommendation,
  onAssetClick,
  onAccept,
  onReject,
  onViewDetails,
  showItems = true,
  maxItems = 6,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const typeConfig = getTypeConfig(recommendation.recommendation_type);
  const statusConfig = getStatusConfig(recommendation.status);

  const items = recommendation.items || [];
  const displayItems = isExpanded ? items : items.slice(0, maxItems);
  const hasMoreItems = items.length > maxItems;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-secondary rounded-xl border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${typeConfig.color}`}>
              {typeConfig.icon}
              {typeConfig.label}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
          <FeedbackButtons
            workspaceId={workspaceId}
            recommendationId={recommendation.recommendation_id}
            currentStatus={recommendation.status}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-tertiary">
              {formatDate(recommendation.requested_at)} • {items.length} photos
            </p>
            {recommendation.target_theme && (
              <p className="text-xs text-text-tertiary mt-1">
                Theme: {recommendation.target_theme}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">
              Quality: <span className="font-medium text-text-primary">
                {recommendation.avg_quality_score ? Math.round(recommendation.avg_quality_score) : 'N/A'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Items Grid */}
      {showItems && items.length > 0 && (
        <div className="p-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <AnimatePresence mode="popLayout">
              {displayItems.map((item, index) => (
                <RecommendationItemCard
                  key={item.item_id}
                  item={item}
                  rank={index + 1}
                  onAssetClick={onAssetClick}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Expand/Collapse */}
          {hasMoreItems && (
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full mt-3 py-2 px-4 rounded-lg bg-surface-tertiary hover:bg-surface-tertiary/80 transition-colors flex items-center justify-center gap-2 text-sm text-text-secondary"
            >
              {isExpanded ? (
                <>
                  <ChevronDown size={16} className="rotate-180" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown size={16} />
                  Show {items.length - maxItems} More
                </>
              )}
            </motion.button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 pt-0 flex items-center justify-between">
        <div className="flex gap-2">
          {recommendation.status === 'pending' && (
            <>
              {onAccept && (
                <AppButton
                  variant="primary"
                  size="sm"
                  leftIcon={<Check size={14} />}
                  onClick={() => onAccept(recommendation.recommendation_id)}
                >
                  Accept All
                </AppButton>
              )}
              {onReject && (
                <AppButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<X size={14} />}
                  onClick={() => onReject(recommendation.recommendation_id)}
                >
                  Reject
                </AppButton>
              )}
            </>
          )}
        </div>
        {onViewDetails && (
          <AppButton
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight size={14} />}
            onClick={() => onViewDetails(recommendation.recommendation_id)}
          >
            View Details
          </AppButton>
        )}
      </div>
    </motion.div>
  );
};

export default RecommendationCard;
