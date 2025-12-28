/**
 * HashtagGenerator Component
 * Generate AI-powered categorized hashtags for social media
 * Feature: AI-powered photo features (US3)
 */

import React, { useState, useCallback } from 'react';
import { Hash, Copy, Check, Loader2, AlertCircle, RefreshCw, TrendingUp, Target, Globe, Bookmark } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useToast } from '../../ui/Toast';
import { HashtagService } from '../../../services/hashtagService';
import type { HashtagResult } from '../../../types/aiFeatures';

interface HashtagGeneratorProps {
  workspaceId: string;
  assetId: string;
  onHashtagsSelected?: (hashtags: string[]) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  trending: <TrendingUp className="w-4 h-4" />,
  niche: <Target className="w-4 h-4" />,
  general: <Globe className="w-4 h-4" />,
  branded: <Bookmark className="w-4 h-4" />,
};

const categoryLabels: Record<string, string> = {
  trending: 'Trending',
  niche: 'Niche',
  general: 'General',
  branded: 'Branded',
};

export const HashtagGenerator: React.FC<HashtagGeneratorProps> = ({
  workspaceId,
  assetId,
  onHashtagsSelected,
}) => {
  const [count, setCount] = useState(15);
  const [result, setResult] = useState<HashtagResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const hashtagResult = await HashtagService.generateHashtags(workspaceId, assetId, {
        count,
      });

      setResult(hashtagResult);
      addToast({ message: 'Hashtags generated', variant: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate hashtags';

      if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
        setError('AI features require a Gemini API key. Configure it in Settings > AI & Gemini.');
      } else {
        setError(errorMessage);
      }

      addToast({ message: 'Generation failed', variant: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, assetId, count, addToast]);

  const handleCopyAll = useCallback(async () => {
    if (!result) return;

    try {
      const hashtagString = result.hashtags.join(' ');
      await navigator.clipboard.writeText(hashtagString);
      setCopiedAll(true);
      addToast({ message: 'All hashtags copied', variant: 'success' });
      onHashtagsSelected?.(result.hashtags);

      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      addToast({ message: 'Failed to copy', variant: 'error' });
    }
  }, [result, addToast, onHashtagsSelected]);

  const handleCopyCategory = useCallback(async (category: string, hashtags: string[]) => {
    try {
      const hashtagString = hashtags.join(' ');
      await navigator.clipboard.writeText(hashtagString);
      setCopiedCategory(category);
      addToast({ message: `${categoryLabels[category]} hashtags copied`, variant: 'success' });

      setTimeout(() => setCopiedCategory(null), 2000);
    } catch {
      addToast({ message: 'Failed to copy', variant: 'error' });
    }
  }, [addToast]);

  return (
    <AppCard padding="md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Hash className="w-5 h-5 text-accent" />
          Hashtag Generator
        </h3>
      </div>

      {/* Count Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Number of Hashtags
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={5}
            max={30}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
            className="flex-1 h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-accent"
            aria-label="Number of hashtags"
          />
          <span className="w-8 text-sm font-medium text-text-primary text-center">
            {count}
          </span>
        </div>
      </div>

      {/* Generate Button */}
      <AppButton
        variant="primary"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full mb-4"
        leftIcon={
          isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Hash className="w-4 h-4" />
          )
        }
      >
        {isGenerating ? 'Generating...' : 'Generate Hashtags'}
      </AppButton>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-error/10 rounded-lg text-error text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && Object.keys(result.categories).length > 0 && (
        <div className="space-y-4">
          {/* Copy All Button */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">
              {result.hashtags.length} hashtags generated
            </span>
            <div className="flex items-center gap-2">
              <AppButton
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                leftIcon={<RefreshCw className="w-3 h-3" />}
              >
                Regenerate
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                leftIcon={
                  copiedAll ? (
                    <Check className="w-3 h-3 text-success" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )
                }
              >
                {copiedAll ? 'Copied!' : 'Copy All'}
              </AppButton>
            </div>
          </div>

          {/* Categories */}
          {Object.entries(result.categories).map(([category, hashtags]) => {
            if (!hashtags || hashtags.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                    {categoryIcons[category]}
                    {categoryLabels[category] || category}
                  </span>
                  <button
                    onClick={() => handleCopyCategory(category, hashtags)}
                    className="flex items-center gap-1 text-xs text-text-tertiary hover:text-accent transition-colors"
                    aria-label={`Copy ${category} hashtags`}
                  >
                    {copiedCategory === category ? (
                      <>
                        <Check className="w-3 h-3 text-success" />
                        <span className="text-success">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((hashtag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-accent/10 text-accent text-xs rounded-full"
                    >
                      {hashtag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppCard>
  );
};

export default HashtagGenerator;
