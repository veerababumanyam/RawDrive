/**
 * PhotoAnalysisPanel Component
 * Feature: 010-ai-powered-features
 * Tasks: T014 - Create frontend PhotoAnalysisPanel component with loading states
 *        T016 - Implement quality badge display based on analysis scores
 *
 * AI-powered photo analysis with quality scoring, metadata, and suggestions
 */

import React, { useState, useCallback } from 'react';
import {
  Camera,
  Sparkles,
  Star,
  Palette,
  Sun,
  Heart,
  Lightbulb,
  Target,
  Hash,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import { PhotoAnalysisService } from '@/services/photoAnalysisService';
import type { PhotoAnalysisResult } from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoAnalysisPanelProps {
  /** Workspace ID */
  workspaceId: string;
  /** Asset ID to analyze */
  assetId: string;
  /** Photo URL for display */
  photoUrl?: string;
  /** Photo filename for display */
  filename?: string;
  /** Optional callback when analysis completes */
  onAnalysisComplete?: (result: PhotoAnalysisResult) => void;
  /** Optional custom class name */
  className?: string;
  /** Compact mode for inline usage */
  compact?: boolean;
}

// Quality badge configuration
const QUALITY_BADGES = [
  { min: 90, stars: 5, label: 'Excellent', color: 'text-gold' },
  { min: 75, stars: 4, label: 'Good', color: 'text-success' },
  { min: 60, stars: 3, label: 'Fair', color: 'text-accent' },
  { min: 40, stars: 2, label: 'Poor', color: 'text-warning' },
  { min: 0, stars: 1, label: 'Very Poor', color: 'text-error' },
];

// ---------------------------------------------------------------------------
// Quality Badge Component
// ---------------------------------------------------------------------------

interface QualityBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({ score, size = 'md' }) => {
  const badge = QUALITY_BADGES.find((b) => score >= b.min) || QUALITY_BADGES[4];

  const sizeClasses = {
    sm: 'text-xs gap-0.5',
    md: 'text-sm gap-1',
    lg: 'text-base gap-1.5',
  };

  const starSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div
      className={`inline-flex items-center ${sizeClasses[size]} ${badge.color}`}
      aria-label={`Quality score: ${score}/100 - ${badge.label}`}
      title={`${badge.label} (${score}/100)`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${starSizes[size]} ${i < badge.stars ? 'fill-current' : 'opacity-30'}`}
        />
      ))}
      <span className="ml-1 font-medium">{score}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score Bar Component
// ---------------------------------------------------------------------------

interface ScoreBarProps {
  label: string;
  score: number;
  icon: React.ReactNode;
}

const ScoreBar: React.FC<ScoreBarProps> = ({ label, score, icon }) => {
  const getBarColor = (value: number) => {
    if (value >= 80) return 'bg-success';
    if (value >= 60) return 'bg-accent';
    if (value >= 40) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-text-secondary">
          {icon}
          {label}
        </span>
        <span className="font-medium text-text-primary">{score}%</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(score)}`}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const PhotoAnalysisPanel: React.FC<PhotoAnalysisPanelProps> = ({
  workspaceId,
  assetId,
  photoUrl,
  filename,
  onAnalysisComplete,
  className = '',
  compact = false,
}) => {
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null);

  // UI state
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);

  // Analyze photo
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const analysisResult = await PhotoAnalysisService.analyzePhoto(
        workspaceId,
        assetId,
        { photo_url: photoUrl || '' }
      );

      setResult(analysisResult);
      onAnalysisComplete?.(analysisResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [workspaceId, assetId, photoUrl, onAnalysisComplete]);

  // Reanalyze
  const handleReanalyze = useCallback(() => {
    setResult(null);
    handleAnalyze();
  }, [handleAnalyze]);

  // Copy tags
  const handleCopyTags = useCallback(async () => {
    if (!result?.tags) return;
    try {
      await navigator.clipboard.writeText(result.tags.join(', '));
      setCopiedTags(true);
      setTimeout(() => setCopiedTags(false), 2000);
    } catch {
      setError('Failed to copy');
    }
  }, [result]);

  // Copy hashtags
  const handleCopyHashtags = useCallback(async () => {
    if (!result?.hashtags) return;
    try {
      await navigator.clipboard.writeText(result.hashtags.join(' '));
      setCopiedHashtags(true);
      setTimeout(() => setCopiedHashtags(false), 2000);
    } catch {
      setError('Failed to copy');
    }
  }, [result]);

  return (
    <AIErrorBoundary featureName="Photo Analysis">
      <div className={`bg-surface rounded-card border border-border ${compact ? 'p-4' : 'p-6'} ${className}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <Camera className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-text-primary`}>
              Photo Analysis
            </h3>
            {filename && (
              <p className="text-sm text-text-secondary truncate">{filename}</p>
            )}
          </div>
          {result && (
            <QualityBadge score={result.quality_score} size={compact ? 'sm' : 'md'} />
          )}
        </div>

        {/* Loading state */}
        {isAnalyzing && (
          <div className="mb-4">
            <AISpinner featureType="analysis" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm"
            role="alert"
          >
            <p className="font-medium">Analysis failed</p>
            <p className="opacity-80 mt-0.5">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <div className="space-y-4">
            {/* Description */}
            <div>
              <p className="text-text-primary leading-relaxed">{result.description}</p>
            </div>

            {/* Quality Scores */}
            <div className="ai-result-card p-4 space-y-3">
              <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Quality Metrics
              </h4>
              <div className="space-y-2.5">
                <ScoreBar
                  label="Sharpness"
                  score={result.sharpness}
                  icon={<Target className="w-3.5 h-3.5" />}
                />
                <ScoreBar
                  label="Exposure"
                  score={result.exposure}
                  icon={<Sun className="w-3.5 h-3.5" />}
                />
                <ScoreBar
                  label="Composition"
                  score={result.composition}
                  icon={<Camera className="w-3.5 h-3.5" />}
                />
              </div>
            </div>

            {/* Metadata Grid */}
            <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
              {/* Lighting */}
              <div className="ai-result-card p-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary mb-1">
                  <Sun className="w-3.5 h-3.5" />
                  Lighting
                </span>
                <p className="text-sm font-medium text-text-primary capitalize">
                  {result.lighting}
                </p>
              </div>

              {/* Mood */}
              <div className="ai-result-card p-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary mb-1">
                  <Heart className="w-3.5 h-3.5" />
                  Mood
                </span>
                <p className="text-sm font-medium text-text-primary capitalize">
                  {result.mood}
                </p>
              </div>
            </div>

            {/* Dominant Colors */}
            {result.dominant_colors.length > 0 && (
              <div className="ai-result-card p-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
                  <Palette className="w-3.5 h-3.5" />
                  Dominant Colors
                </span>
                <div className="flex gap-2">
                  {result.dominant_colors.map((color, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {result.tags.length > 0 && (
              <div className="ai-result-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Hash className="w-3.5 h-3.5" />
                    Tags
                  </span>
                  <button
                    onClick={handleCopyTags}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                    aria-label="Copy tags"
                  >
                    {copiedTags ? (
                      <>
                        <Check className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag, i) => (
                    <span key={i} className="ai-tag ai-tag-primary">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags */}
            {result.hashtags.length > 0 && (
              <div className="ai-result-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Hash className="w-3.5 h-3.5" />
                    Hashtags
                  </span>
                  <button
                    onClick={handleCopyHashtags}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                    aria-label="Copy hashtags"
                  >
                    {copiedHashtags ? (
                      <>
                        <Check className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.hashtags.map((hashtag, i) => (
                    <span key={i} className="ai-tag ai-tag-accent">
                      {hashtag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Improvements */}
            {result.improvements.length > 0 && (
              <div className="ai-result-card p-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
                  <Lightbulb className="w-3.5 h-3.5" />
                  Suggestions
                </span>
                <ul className="space-y-1.5">
                  {result.improvements.map((improvement, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-text-primary"
                    >
                      <span className="text-accent mt-0.5">•</span>
                      {improvement}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Best For */}
            {result.best_for.length > 0 && (
              <div className="ai-result-card p-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
                  <Target className="w-3.5 h-3.5" />
                  Best For
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.best_for.map((use, i) => (
                    <span key={i} className="ai-tag ai-tag-success">
                      {use}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Reanalyze button */}
            <AppButton
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={handleReanalyze}
              className="w-full"
            >
              Reanalyze
            </AppButton>
          </div>
        )}

        {/* Analyze button (initial state) */}
        {!result && !isAnalyzing && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Sparkles className="w-4 h-4" />}
            onClick={handleAnalyze}
          >
            Analyze Photo
          </AppButton>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default PhotoAnalysisPanel;
