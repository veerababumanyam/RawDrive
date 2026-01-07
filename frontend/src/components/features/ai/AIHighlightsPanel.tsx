import React from 'react';
import {
  Sparkles,
  TrendingUp,
  Image as ImageIcon,
  Users,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '@/components/ui/AppButton';

/* =============================================================================
   AIHighlightsPanel Component

   Displays AI-powered insights and highlights:
   - Smart curation suggestions
   - Quality analysis results
   - Face detection summaries
   - Quick actions for AI features
   ============================================================================= */

export interface AIHighlight {
  id: string;
  type: 'curation' | 'quality' | 'faces' | 'analysis';
  title: string;
  description: string;
  count?: number;
  severity?: 'info' | 'success' | 'warning' | 'error';
  action?: {
    label: string;
    path: string;
  };
  timestamp?: Date;
}

export interface AIHighlightsPanelProps {
  workspaceId: string;
  galleryId?: string;
  highlights?: AIHighlight[];
  isLoading?: boolean;
  onClose?: () => void;
}

export const AIHighlightsPanel: React.FC<AIHighlightsPanelProps> = ({
  workspaceId,
  galleryId,
  highlights = [],
  isLoading = false,
  onClose,
}) => {
  const navigate = useNavigate();

  const handleAction = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const getIcon = (type: AIHighlight['type']) => {
    switch (type) {
      case 'curation':
        return <Sparkles size={20} className="text-accent-500" />;
      case 'quality':
        return <TrendingUp size={20} className="text-success-500" />;
      case 'faces':
        return <Users size={20} className="text-primary-500" />;
      case 'analysis':
        return <ImageIcon size={20} className="text-info-500" />;
      default:
        return <Zap size={20} className="text-text-tertiary" />;
    }
  };

  const getSeverityColor = (severity?: AIHighlight['severity']) => {
    switch (severity) {
      case 'success':
        return 'text-success-500';
      case 'warning':
        return 'text-warning-500';
      case 'error':
        return 'text-error-500';
      default:
        return 'text-info-500';
    }
  };

  const getSeverityBg = (severity?: AIHighlight['severity']) => {
    switch (severity) {
      case 'success':
        return 'bg-success-50 dark:bg-success-900/10';
      case 'warning':
        return 'bg-warning-50 dark:bg-warning-900/10';
      case 'error':
        return 'bg-error-50 dark:bg-error-900/10';
      default:
        return 'bg-info-50 dark:bg-info-900/10';
    }
  };

  const formatRelativeTime = (date?: Date): string => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="w-80 md:w-96 p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
        <p className="text-center text-text-tertiary mt-3 text-sm">
          Loading AI insights...
        </p>
      </div>
    );
  }

  if (highlights.length === 0) {
    return (
      <div className="w-80 md:w-96 p-6 text-center">
        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Sparkles size={24} className="text-white" />
        </div>
        <h3 className="font-semibold text-text-primary mb-2">No AI Insights Yet</h3>
        <p className="text-sm text-text-tertiary mb-4">
          Start using AI features to see smart recommendations and insights here.
        </p>
        {galleryId && (
          <AppButton
            variant="primary"
            size="sm"
            onClick={() => handleAction(`/workspace/galleries/${galleryId}?tab=smart-curate`)}
            leftIcon={<Sparkles size={16} />}
          >
            Start Smart Curation
          </AppButton>
        )}
      </div>
    );
  }

  // Calculate summary stats
  const totalHighlights = highlights.length;
  const actionableHighlights = highlights.filter((h) => h.action).length;

  return (
    <div className="w-80 md:w-96">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <h3 className="font-semibold text-text-primary">AI Insights</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <Zap size={14} />
            <span>{totalHighlights} active</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 py-3 bg-surface-hover/50 border-b border-border">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success-500" />
            <div>
              <p className="text-xs text-text-tertiary">Ready to Action</p>
              <p className="text-sm font-semibold text-text-primary">
                {actionableHighlights}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-info-500" />
            <div>
              <p className="text-xs text-text-tertiary">Total Insights</p>
              <p className="text-sm font-semibold text-text-primary">{totalHighlights}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights List */}
      <div className="max-h-80 overflow-y-auto">
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            className={`
              px-4 py-3 border-b border-border last:border-b-0
              hover:bg-surface-hover transition-colors
              ${highlight.action ? 'cursor-pointer' : ''}
            `}
            onClick={() => highlight.action && handleAction(highlight.action.path)}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className={`
                  w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                  ${getSeverityBg(highlight.severity)}
                `}
              >
                {getIcon(highlight.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium text-text-primary">
                    {highlight.title}
                  </h4>
                  {highlight.count !== undefined && (
                    <span
                      className={`
                        text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0
                        ${getSeverityColor(highlight.severity)}
                        ${getSeverityBg(highlight.severity)}
                      `}
                    >
                      {highlight.count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary line-clamp-2 mb-2">
                  {highlight.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  {highlight.timestamp && (
                    <span className="text-xs text-text-tertiary">
                      {formatRelativeTime(highlight.timestamp)}
                    </span>
                  )}
                  {highlight.action && (
                    <button
                      className="flex items-center gap-1 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(highlight.action!.path);
                      }}
                    >
                      {highlight.action.label}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-border bg-surface-hover/30">
        <div className="flex gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            fullWidth
            onClick={() => handleAction('/workspace/ai-insights')}
          >
            View All Insights
          </AppButton>
          {galleryId && (
            <AppButton
              variant="primary"
              size="sm"
              fullWidth
              onClick={() =>
                handleAction(`/workspace/galleries/${galleryId}?tab=smart-curate`)
              }
              leftIcon={<Sparkles size={14} />}
            >
              Smart Curate
            </AppButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIHighlightsPanel;
