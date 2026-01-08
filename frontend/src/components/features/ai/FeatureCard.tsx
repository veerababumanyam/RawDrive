/**
 * FeatureCard Component
 *
 * Reusable card component for displaying AI features in a standardized format.
 * Shows status, progress, and quick actions with expandable details.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureStatus = 'idle' | 'active' | 'completed' | 'error';

export interface FeatureCardProps {
  /** Feature title */
  title: string;
  /** Feature description */
  description?: string;
  /** Icon to display */
  icon: React.ReactNode;
  /** Current status */
  status?: FeatureStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message if status is error */
  error?: string;
  /** Whether the card is expanded */
  expanded?: boolean;
  /** Callback when card is toggled */
  onToggle?: () => void;
  /** Primary action button */
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
    icon?: React.ReactNode;
  };
  /** Secondary actions */
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  }>;
  /** Additional content to show when expanded */
  children?: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Color variant */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  status = 'idle',
  progress,
  error,
  expanded = false,
  onToggle,
  primaryAction,
  secondaryActions,
  children,
  className = '',
  variant = 'default',
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
    onToggle?.();
  };

  const statusConfig = {
    idle: {
      icon: null,
      color: 'text-text-secondary',
      bgColor: 'bg-background/50',
    },
    active: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    completed: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    error: {
      icon: <XCircle className="w-4 h-4" />,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
  };

  const variantConfig = {
    default: 'border-border/50 bg-background/50',
    primary: 'border-primary/30 bg-primary/5',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    error: 'border-red-500/30 bg-red-500/5',
  };

  const config = statusConfig[status];
  const variantClass = variantConfig[variant];

  return (
    <div
      className={`rounded-lg border transition-all ${variantClass} ${className}`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 p-4 ${
          onToggle || children ? 'cursor-pointer hover:bg-surface-hover' : ''
        } transition-colors`}
        onClick={onToggle || children ? handleToggle : undefined}
      >
        {/* Icon */}
        <div className={`p-2 rounded-lg ${config.bgColor} ${config.color}`}>
          {status === 'active' ? config.icon : icon}
        </div>

        {/* Title and Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            {status !== 'idle' && (
              <span className={`text-xs ${config.color}`}>
                {status === 'active' && progress !== undefined
                  ? `${progress}%`
                  : status === 'completed'
                  ? 'Done'
                  : status === 'error'
                  ? 'Error'
                  : ''}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
              {description}
            </p>
          )}
        </div>

        {/* Status Icon */}
        {status !== 'idle' && status !== 'active' && (
          <div className={config.color}>{config.icon}</div>
        )}

        {/* Expand/Collapse Icon */}
        {(onToggle || children) && (
          <div className="text-text-tertiary">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {status === 'active' && progress !== undefined && (
        <div className="px-4 pb-4">
          <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && error && (
        <div className="px-4 pb-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && children && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-4">
          {children}
        </div>
      )}

      {/* Actions */}
      {(primaryAction || secondaryActions) && (
        <div className="px-4 pb-4 flex items-center gap-2 border-t border-border/50 pt-4">
          {primaryAction && (
            <AppButton
              variant="primary"
              size="sm"
              onClick={primaryAction.onClick}
              isLoading={primaryAction.loading}
              disabled={primaryAction.disabled}
              leftIcon={primaryAction.icon}
              className="flex-1"
            >
              {primaryAction.label}
            </AppButton>
          )}
          {secondaryActions?.map((action, idx) => (
            <AppButton
              key={idx}
              variant="outline"
              size="sm"
              onClick={action.onClick}
              leftIcon={action.icon}
            >
              {action.label}
            </AppButton>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureCard;
