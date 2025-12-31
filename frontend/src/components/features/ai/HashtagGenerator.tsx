/**
 * HashtagGenerator Component
 * Feature: 010-ai-powered-features
 * Tasks: T038 - Create frontend HashtagGenerator component
 *        T040 - Implement hashtag copy-to-clipboard functionality
 *
 * AI-powered hashtag generation with category organization
 */

import React, { useState, useCallback } from 'react';
import {
  Hash,
  Wand2,
  Copy,
  Check,
  RefreshCw,
  TrendingUp,
  Target,
  Globe,
  Bookmark,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import { HashtagService } from '@/services/hashtagService';
import type { HashtagResult, GenerateHashtagsRequest } from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HashtagGeneratorProps {
  /** Workspace ID */
  workspaceId: string;
  /** Asset ID to generate hashtags for */
  assetId: string;
  /** Photo filename for display */
  filename?: string;
  /** Optional callback when hashtags are generated */
  onHashtagsGenerated?: (result: HashtagResult) => void;
  /** Optional custom class name */
  className?: string;
  /** Compact mode for inline usage */
  compact?: boolean;
}

type HashtagCategory = 'trending' | 'niche' | 'general' | 'branded';

const CATEGORY_CONFIG: Record<HashtagCategory, { label: string; icon: React.ReactNode; color: string }> = {
  trending: {
    label: 'Trending',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: 'ai-tag-error',
  },
  niche: {
    label: 'Niche',
    icon: <Target className="w-3.5 h-3.5" />,
    color: 'ai-tag-accent',
  },
  general: {
    label: 'General',
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'ai-tag-primary',
  },
  branded: {
    label: 'Branded',
    icon: <Bookmark className="w-3.5 h-3.5" />,
    color: 'ai-tag-success',
  },
};

const COUNT_OPTIONS = [10, 15, 20, 30];


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HashtagGenerator: React.FC<HashtagGeneratorProps> = ({
  workspaceId,
  assetId,
  filename,
  onHashtagsGenerated,
  className = '',
  compact = false,
}) => {
  // Form state
  const [count, setCount] = useState(15);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HashtagResult | null>(null);

  // UI state
  const [copied, setCopied] = useState(false);
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [showCategorized, setShowCategorized] = useState(true);

  // Generate hashtags
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const request: GenerateHashtagsRequest = { count };
      const hashtagResult = await HashtagService.generateHashtags(
        workspaceId,
        assetId,
        request
      );

      setResult(hashtagResult);
      onHashtagsGenerated?.(hashtagResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Hashtag generation failed';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, assetId, count, onHashtagsGenerated]);

  // Copy all hashtags
  const handleCopyAll = useCallback(async () => {
    if (!result?.hashtags) return;
    try {
      await navigator.clipboard.writeText(result.hashtags.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy');
    }
  }, [result]);

  // Copy category hashtags
  const handleCopyCategory = useCallback(async (category: HashtagCategory) => {
    if (!result?.categories[category]) return;
    try {
      await navigator.clipboard.writeText(result.categories[category].join(' '));
      setCopiedCategory(category);
      setTimeout(() => setCopiedCategory(null), 2000);
    } catch {
      setError('Failed to copy');
    }
  }, [result]);

  // Regenerate
  const handleRegenerate = useCallback(() => {
    setResult(null);
    handleGenerate();
  }, [handleGenerate]);

  return (
    <AIErrorBoundary featureName="Hashtag Generator">
      <div className={`bg-surface rounded-card border border-border ${compact ? 'p-4' : 'p-6'} ${className}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <Hash className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-text-primary`}>
              Hashtag Generator
            </h3>
            {filename && (
              <p className="text-sm text-text-secondary truncate">{filename}</p>
            )}
          </div>
        </div>

        {/* Options (when not showing results) */}
        {!result && !isGenerating && (
          <div className="space-y-4 mb-4">
            {/* Count selector */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Number of Hashtags
              </label>
              <div className="flex gap-2">
                {COUNT_OPTIONS.map((num) => (
                  <button
                    key={num}
                    onClick={() => setCount(num)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      count === num
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-background border-border text-text-primary hover:border-accent'
                    }`}
                    aria-pressed={count === num}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Info text */}
            <p className="text-xs text-text-secondary">
              Hashtags will be organized into categories: trending, niche, general, and branded.
            </p>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && (
          <div className="mb-4">
            <AISpinner featureType="hashtag" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm"
            role="alert"
          >
            <p className="font-medium">Generation failed</p>
            <p className="opacity-80 mt-0.5">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && !isGenerating && (
          <div className="space-y-4 mb-4">
            {/* View toggle and copy all */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 p-1 bg-background rounded-lg">
                <button
                  onClick={() => setShowCategorized(true)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    showCategorized
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Categorized
                </button>
                <button
                  onClick={() => setShowCategorized(false)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    !showCategorized
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  All ({result.hashtags.length})
                </button>
              </div>
              <button
                onClick={handleCopyAll}
                className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                aria-label="Copy all hashtags"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" /> Copied All
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy All
                  </>
                )}
              </button>
            </div>

            {/* Categorized view */}
            {showCategorized && (
              <div className="space-y-3">
                {(Object.keys(CATEGORY_CONFIG) as HashtagCategory[]).map((category) => {
                  const hashtags = result.categories[category];
                  if (!hashtags || hashtags.length === 0) return null;

                  const config = CATEGORY_CONFIG[category];

                  return (
                    <div key={category} className="ai-result-card p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                          {config.icon}
                          {config.label}
                          <span className="text-text-tertiary">({hashtags.length})</span>
                        </span>
                        <button
                          onClick={() => handleCopyCategory(category)}
                          className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                          aria-label={`Copy ${category} hashtags`}
                        >
                          {copiedCategory === category ? (
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
                        {hashtags.map((hashtag, i) => (
                          <span key={i} className={`ai-tag ${config.color}`}>
                            {hashtag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* All hashtags view */}
            {!showCategorized && (
              <div className="ai-result-card p-4">
                <div className="flex flex-wrap gap-1.5">
                  {result.hashtags.map((hashtag, i) => (
                    <span key={i} className="ai-tag ai-tag-primary">
                      {hashtag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleRegenerate}
                className="flex-1"
              >
                Regenerate
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => setResult(null)}
                className="flex-1"
              >
                Change Count
              </AppButton>
            </div>
          </div>
        )}

        {/* Generate button (initial state) */}
        {!result && !isGenerating && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Wand2 className="w-4 h-4" />}
            onClick={handleGenerate}
          >
            Generate Hashtags
          </AppButton>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default HashtagGenerator;
