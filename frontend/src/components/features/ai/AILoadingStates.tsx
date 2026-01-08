/**
 * AI Loading States and Progress Indicators
 *
 * Reusable loading components for AI features.
 * Feature: 010-ai-powered-features
 * Task: T074 - Add loading states and progress indicators
 */

import React from 'react';
import { Sparkles, Camera, Hash, BookOpen, Wand2 } from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';

interface AILoadingProps {
  message?: string;
  progress?: number;
  featureType?: 'analysis' | 'caption' | 'hashtag' | 'story' | 'curation' | 'duplicate-detection';
}

/**
 * Feature-specific icons and messages
 */
const FEATURE_CONFIG = {
  analysis: {
    icon: Camera,
    defaultMessage: 'Analyzing photo...',
    steps: ['Detecting objects', 'Evaluating quality', 'Analyzing composition'],
  },
  caption: {
    icon: Sparkles,
    defaultMessage: 'Generating captions...',
    steps: ['Understanding content', 'Crafting captions', 'Polishing style'],
  },
  hashtag: {
    icon: Hash,
    defaultMessage: 'Generating hashtags...',
    steps: ['Identifying themes', 'Finding trending tags', 'Categorizing'],
  },
  story: {
    icon: BookOpen,
    defaultMessage: 'Writing story...',
    steps: ['Analyzing gallery', 'Crafting narrative', 'Adding details'],
  },
  curation: {
    icon: Wand2,
    defaultMessage: 'Curating photos...',
    steps: ['Scoring quality', 'Checking diversity', 'Selecting best'],
  },
  'duplicate-detection': {
    icon: Camera,
    defaultMessage: 'Detecting duplicates...',
    steps: ['Analyzing content', 'Comparing similarity', 'Grouping matches'],
  },
};

/**
 * Animated pulse indicator
 */
export const AIPulseIndicator: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative ${className}`}>
    <div className="absolute inset-0 bg-accent/20 rounded-full animate-ping" />
    <div className="relative w-3 h-3 bg-accent rounded-full" />
  </div>
);

/**
 * Skeleton loader for AI results
 */
export const AIResultSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="h-4 bg-surface-hover rounded"
        style={{ width: `${Math.random() * 30 + 60}%` }}
      />
    ))}
  </div>
);

/**
 * Progress bar with AI styling
 */
export const AIProgressBar: React.FC<{ progress: number; showPercent?: boolean }> = ({
  progress,
  showPercent = true,
}) => (
  <div className="w-full">
    <div className="flex justify-between items-center mb-2">
      <span className="text-sm text-text-secondary">Processing</span>
      {showPercent && (
        <span className="text-sm font-medium text-accent">{Math.round(progress)}%</span>
      )}
    </div>
    <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-accent to-primary rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  </div>
);

/**
 * Spinning loader with feature icon
 */
export const AISpinner: React.FC<AILoadingProps> = ({
  message,
  featureType = 'analysis',
}) => {
  const config = FEATURE_CONFIG[featureType];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative">
        <div className="absolute inset-0 bg-accent/20 rounded-full animate-pulse" />
        <div className="relative p-4 bg-surface rounded-full">
          <Icon className="w-8 h-8 text-accent animate-pulse" aria-hidden="true" />
        </div>
      </div>
      <p className="text-text-secondary text-center" role="status" aria-live="polite">
        {message || config.defaultMessage}
      </p>
    </div>
  );
};

/**
 * Stepped loading indicator showing progress through AI stages
 */
export const AISteppedLoader: React.FC<AILoadingProps & { currentStep?: number }> = ({
  featureType = 'analysis',
  currentStep = 0,
}) => {
  const config = FEATURE_CONFIG[featureType];
  const Icon = config.icon;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-accent/10 rounded-lg">
          <Icon className="w-5 h-5 text-accent" aria-hidden="true" />
        </div>
        <span className="font-medium text-text-primary">{config.defaultMessage}</span>
      </div>
      <div className="space-y-3">
        {config.steps.map((step, index) => (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${index < currentStep
                  ? 'bg-success text-white'
                  : index === currentStep
                    ? 'bg-accent text-white animate-pulse'
                    : 'bg-surface-hover text-text-tertiary'
                }`}
            >
              {index < currentStep ? '✓' : index + 1}
            </div>
            <span
              className={`text-sm ${index <= currentStep ? 'text-text-primary' : 'text-text-tertiary'
                }`}
            >
              {step}
            </span>
            {index === currentStep && (
              <AIPulseIndicator className="ml-auto" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Full card loading state for AI features
 */
export const AILoadingCard: React.FC<AILoadingProps> = ({
  message,
  progress,
  featureType = 'analysis',
}) => {
  const config = FEATURE_CONFIG[featureType];
  const Icon = config.icon;

  return (
    <AppCard className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="p-3 bg-accent/10 rounded-xl">
          <Icon className="w-6 h-6 text-accent animate-pulse" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">
            {message || config.defaultMessage}
          </h3>
          <p className="text-sm text-text-secondary">Please wait while AI processes your request</p>
        </div>
      </div>
      {progress !== undefined ? (
        <AIProgressBar progress={progress} />
      ) : (
        <AIResultSkeleton lines={3} />
      )}
    </AppCard>
  );
};

/**
 * Inline loading indicator for buttons
 */
export const AIButtonLoader: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <Sparkles
      className={`${sizeClasses} animate-spin text-current`}
      aria-hidden="true"
    />
  );
};

export default {
  AIPulseIndicator,
  AIResultSkeleton,
  AIProgressBar,
  AISpinner,
  AISteppedLoader,
  AILoadingCard,
  AIButtonLoader,
};
