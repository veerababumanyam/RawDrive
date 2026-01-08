/**
 * EmotionBadge Component
 * Display dominant emotion badge on photo thumbnails
 *
 * Shows:
 * - Emoji icon for the emotion
 * - Confidence percentage
 * - Color-coded background
 *
 * Phase 3: Frontend Integration for Emotion Detection
 */

import React from 'react';
import type { EmotionType } from './EmotionFilter';

export interface EmotionBadgeProps {
  /** Dominant detected emotion */
  emotion: EmotionType;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Show confidence percentage */
  showConfidence?: boolean;
  /** Compact mode (smaller size) */
  compact?: boolean;
  className?: string;
}

interface EmotionConfig {
  emoji: string;
  label: string;
  bgColor: string;
  textColor: string;
}

const EMOTION_CONFIGS: Record<EmotionType, EmotionConfig> = {
  joy: {
    emoji: '😊',
    label: 'Joy',
    bgColor: 'bg-yellow-500/90',
    textColor: 'text-white',
  },
  sadness: {
    emoji: '😢',
    label: 'Sad',
    bgColor: 'bg-blue-500/90',
    textColor: 'text-white',
  },
  anger: {
    emoji: '😠',
    label: 'Angry',
    bgColor: 'bg-red-500/90',
    textColor: 'text-white',
  },
  surprise: {
    emoji: '😮',
    label: 'Surprised',
    bgColor: 'bg-purple-500/90',
    textColor: 'text-white',
  },
  fear: {
    emoji: '😨',
    label: 'Fearful',
    bgColor: 'bg-indigo-500/90',
    textColor: 'text-white',
  },
  disgust: {
    emoji: '🤢',
    label: 'Disgusted',
    bgColor: 'bg-green-500/90',
    textColor: 'text-white',
  },
  contentment: {
    emoji: '😌',
    label: 'Content',
    bgColor: 'bg-teal-500/90',
    textColor: 'text-white',
  },
};

export const EmotionBadge: React.FC<EmotionBadgeProps> = ({
  emotion,
  confidence,
  showConfidence = true,
  compact = false,
  className = '',
}) => {
  const config = EMOTION_CONFIGS[emotion];
  const confidencePercentage = Math.round(confidence * 100);

  if (!config) {
    return null;
  }

  return (
    <div
      className={`
        inline-flex items-center gap-1
        ${config.bgColor} ${config.textColor}
        rounded-full backdrop-blur-sm
        ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}
        font-medium shadow-md
        ${className}
      `}
      title={`${config.label} (${confidencePercentage}% confidence)`}
    >
      <span className={compact ? 'text-base' : 'text-lg'}>{config.emoji}</span>
      {showConfidence && (
        <span className="font-semibold">{confidencePercentage}%</span>
      )}
    </div>
  );
};

/**
 * EmotionIndicator - Minimal emotion indicator for photo overlays
 */
export interface EmotionIndicatorProps {
  emotion: EmotionType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const EmotionIndicator: React.FC<EmotionIndicatorProps> = ({
  emotion,
  size = 'md',
  className = '',
}) => {
  const config = EMOTION_CONFIGS[emotion];

  if (!config) {
    return null;
  }

  const sizeClasses = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <span
      className={`inline-block ${sizeClasses[size]} ${className}`}
      title={config.label}
      role="img"
      aria-label={config.label}
    >
      {config.emoji}
    </span>
  );
};
