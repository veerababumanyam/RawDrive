/**
 * CreateTab Component
 *
 * Tab content for AI-powered content creation including:
 * - Gallery story generation
 * - Batch caption generation (per-photo captions)
 * - Aggregate hashtag generation
 *
 * Feature: 024-ai-tools-hub
 */

import React, { useState, useCallback } from 'react';
import {
  BookOpen,
  MessageSquare,
  Hash,
  Wand2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { StoryGenerator } from '../StoryGenerator';
import { CaptionService } from '@/services/captionService';
import { HashtagService } from '@/services/hashtagService';
import type {
  CaptionResult,
  HashtagResult,
  GenerateCaptionsRequest,
  GenerateHashtagsRequest,
} from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTabProps {
  workspaceId: string;
  galleryId: string;
  galleryName: string;
  /** Total number of photos for context */
  totalPhotos?: number;
  /** Selected asset IDs for batch operations (optional) */
  selectedAssetIds?: string[];
}

type CaptionStyle = 'professional' | 'casual' | 'poetic';

const CAPTION_STYLES: { value: CaptionStyle; label: string; icon: string }[] = [
  { value: 'professional', label: 'Professional', icon: '🎯' },
  { value: 'casual', label: 'Casual', icon: '😊' },
  { value: 'poetic', label: 'Poetic', icon: '🌟' },
];

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  description,
  isExpanded,
  onToggle,
}) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center gap-3 p-4 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
    aria-expanded={isExpanded}
  >
    <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="text-xs text-text-secondary truncate">{description}</p>
    </div>
    {isExpanded ? (
      <ChevronDown className="w-4 h-4 text-text-tertiary" />
    ) : (
      <ChevronRight className="w-4 h-4 text-text-tertiary" />
    )}
  </button>
);

interface HashtagDisplayProps {
  hashtags: string[];
  onCopy: () => void;
  copied: boolean;
}

const HashtagDisplay: React.FC<HashtagDisplayProps> = ({ hashtags, onCopy, copied }) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {hashtags.map((tag, idx) => (
        <span
          key={idx}
          className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
        >
          #{tag}
        </span>
      ))}
    </div>
    <AppButton
      variant="outline"
      size="sm"
      onClick={onCopy}
      leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    >
      {copied ? 'Copied!' : 'Copy All'}
    </AppButton>
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CreateTab: React.FC<CreateTabProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos = 0,
  selectedAssetIds = [],
}) => {
  // Section expansion state
  const [expandedSection, setExpandedSection] = useState<'story' | 'captions' | 'hashtags' | null>(
    'story'
  );

  // Caption state
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('professional');
  const [captionCount, setCaptionCount] = useState(3);
  const [captionResults, setCaptionResults] = useState<Map<string, CaptionResult>>(new Map());
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);

  // Hashtag state
  const [hashtagCount, setHashtagCount] = useState(15);
  const [aggregatedHashtags, setAggregatedHashtags] = useState<string[]>([]);
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);
  const [hashtagError, setHashtagError] = useState<string | null>(null);
  const [hashtagsCopied, setHashtagsCopied] = useState(false);

  // Toggle section
  const toggleSection = useCallback((section: 'story' | 'captions' | 'hashtags') => {
    setExpandedSection((current) => (current === section ? null : section));
  }, []);

  // Generate captions for selected assets
  const handleGenerateCaptions = useCallback(async () => {
    if (selectedAssetIds.length === 0) {
      setCaptionError('Please select photos to generate captions for');
      return;
    }

    setIsGeneratingCaptions(true);
    setCaptionError(null);
    const results = new Map<string, CaptionResult>();

    try {
      const request: GenerateCaptionsRequest = {
        style: captionStyle,
        count: captionCount,
      };

      // Generate captions for each selected asset
      for (const assetId of selectedAssetIds) {
        try {
          const result = await CaptionService.generateCaptions(workspaceId, assetId, request);
          results.set(assetId, result);
        } catch (err) {
          console.error(`Failed to generate caption for asset ${assetId}:`, err);
        }
      }

      setCaptionResults(results);

      if (results.size === 0) {
        setCaptionError('Failed to generate captions for any photos');
      }
    } catch (err) {
      setCaptionError(err instanceof Error ? err.message : 'Failed to generate captions');
    } finally {
      setIsGeneratingCaptions(false);
    }
  }, [selectedAssetIds, workspaceId, captionStyle, captionCount]);

  // Generate aggregated hashtags from selected assets
  const handleGenerateHashtags = useCallback(async () => {
    if (selectedAssetIds.length === 0) {
      setHashtagError('Please select photos to generate hashtags from');
      return;
    }

    setIsGeneratingHashtags(true);
    setHashtagError(null);
    const allHashtags: Set<string> = new Set();

    try {
      const request: GenerateHashtagsRequest = {
        count: Math.ceil(hashtagCount / selectedAssetIds.length) + 5, // Request extra to get variety
      };

      // Generate hashtags for each selected asset
      for (const assetId of selectedAssetIds) {
        try {
          const result = await HashtagService.generateHashtags(workspaceId, assetId, request);
          result.hashtags.forEach((tag) => allHashtags.add(tag.toLowerCase()));
        } catch (err) {
          console.error(`Failed to generate hashtags for asset ${assetId}:`, err);
        }
      }

      // Convert to array and limit to requested count
      const uniqueHashtags = Array.from(allHashtags).slice(0, hashtagCount);
      setAggregatedHashtags(uniqueHashtags);

      if (uniqueHashtags.length === 0) {
        setHashtagError('Failed to generate hashtags from any photos');
      }
    } catch (err) {
      setHashtagError(err instanceof Error ? err.message : 'Failed to generate hashtags');
    } finally {
      setIsGeneratingHashtags(false);
    }
  }, [selectedAssetIds, workspaceId, hashtagCount]);

  // Copy all hashtags
  const handleCopyHashtags = useCallback(async () => {
    try {
      const hashtagText = aggregatedHashtags.map((tag) => `#${tag}`).join(' ');
      await navigator.clipboard.writeText(hashtagText);
      setHashtagsCopied(true);
      setTimeout(() => setHashtagsCopied(false), 2000);
    } catch {
      console.warn('Failed to copy hashtags');
    }
  }, [aggregatedHashtags]);

  const hasSelection = selectedAssetIds.length > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Story Section */}
      <section>
        <SectionHeader
          icon={<BookOpen className="w-4 h-4" />}
          title="Gallery Story"
          description="AI-written narrative for your entire gallery"
          isExpanded={expandedSection === 'story'}
          onToggle={() => toggleSection('story')}
        />

        {expandedSection === 'story' && (
          <div className="mt-3 pl-4 border-l-2 border-primary/20">
            <StoryGenerator
              workspaceId={workspaceId}
              galleryId={galleryId}
              galleryName={galleryName}
              photoCount={totalPhotos}
              className="border-0 shadow-none p-0"
            />
          </div>
        )}
      </section>

      {/* Captions Section */}
      <section>
        <SectionHeader
          icon={<MessageSquare className="w-4 h-4" />}
          title="Batch Captions"
          description={`Generate captions for ${hasSelection ? selectedAssetIds.length : 0} selected photos`}
          isExpanded={expandedSection === 'captions'}
          onToggle={() => toggleSection('captions')}
        />

        {expandedSection === 'captions' && (
          <div className="mt-3 pl-4 border-l-2 border-primary/20 space-y-4">
            {!hasSelection ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">No photos selected</span>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Select photos in the gallery to generate captions
                </p>
              </div>
            ) : (
              <>
                {/* Style selector */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Caption Style
                  </label>
                  <div className="flex gap-2">
                    {CAPTION_STYLES.map((style) => (
                      <button
                        key={style.value}
                        onClick={() => setCaptionStyle(style.value)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          captionStyle === style.value
                            ? 'bg-primary text-white'
                            : 'bg-surface hover:bg-surface-hover text-text-primary'
                        }`}
                      >
                        {style.icon} {style.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Count selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">
                      Captions per photo
                    </label>
                    <span className="text-sm font-bold text-primary">{captionCount}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={captionCount}
                    onChange={(e) => setCaptionCount(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Error */}
                {captionError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600">
                    {captionError}
                  </div>
                )}

                {/* Results */}
                {captionResults.size > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-600">
                        Generated {captionResults.size} captions
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Captions are now available on each photo
                    </p>
                  </div>
                )}

                {/* Generate button */}
                <AppButton
                  variant="primary"
                  fullWidth
                  onClick={handleGenerateCaptions}
                  isLoading={isGeneratingCaptions}
                  loadingText="Generating..."
                  leftIcon={<Wand2 className="w-4 h-4" />}
                >
                  Generate Captions for {selectedAssetIds.length} Photos
                </AppButton>
              </>
            )}
          </div>
        )}
      </section>

      {/* Hashtags Section */}
      <section>
        <SectionHeader
          icon={<Hash className="w-4 h-4" />}
          title="Aggregate Hashtags"
          description="Combine hashtags from selected photos"
          isExpanded={expandedSection === 'hashtags'}
          onToggle={() => toggleSection('hashtags')}
        />

        {expandedSection === 'hashtags' && (
          <div className="mt-3 pl-4 border-l-2 border-primary/20 space-y-4">
            {!hasSelection ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">No photos selected</span>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Select photos in the gallery to generate hashtags
                </p>
              </div>
            ) : (
              <>
                {/* Count selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">
                      Total hashtags
                    </label>
                    <span className="text-sm font-bold text-primary">{hashtagCount}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={hashtagCount}
                    onChange={(e) => setHashtagCount(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Error */}
                {hashtagError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600">
                    {hashtagError}
                  </div>
                )}

                {/* Results */}
                {aggregatedHashtags.length > 0 && (
                  <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                    <HashtagDisplay
                      hashtags={aggregatedHashtags}
                      onCopy={handleCopyHashtags}
                      copied={hashtagsCopied}
                    />
                  </div>
                )}

                {/* Generate button */}
                <AppButton
                  variant="primary"
                  fullWidth
                  onClick={handleGenerateHashtags}
                  isLoading={isGeneratingHashtags}
                  loadingText="Generating..."
                  leftIcon={<Sparkles className="w-4 h-4" />}
                >
                  Generate Hashtags from {selectedAssetIds.length} Photos
                </AppButton>
              </>
            )}
          </div>
        )}
      </section>

      {/* Info footer */}
      <div className="text-center pt-4 border-t border-border/50">
        <p className="text-xs text-text-tertiary">
          AI content is generated using your gallery photos.
          <br />
          Select photos in the gallery for batch operations.
        </p>
      </div>
    </div>
  );
};

export default CreateTab;
