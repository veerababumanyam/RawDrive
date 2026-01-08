/**
 * CreateSection Component
 *
 * Section for AI-powered content creation including stories, captions, and hashtags.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState, useCallback } from 'react';
import {
  BookOpen,
  MessageSquare,
  Hash,
  Wand2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { FeatureCard } from '../FeatureCard';
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

export interface CreateSectionProps {
  workspaceId: string;
  galleryId: string;
  galleryName: string;
  totalPhotos: number;
  selectedAssetIds: string[];
  expanded: boolean;
  onToggle: () => void;
  initialFeature?: 'story' | 'captions' | 'hashtags';
}

type CaptionStyle = 'professional' | 'casual' | 'poetic';

const CAPTION_STYLES: { value: CaptionStyle; label: string; icon: string }[] = [
  { value: 'professional', label: 'Professional', icon: '🎯' },
  { value: 'casual', label: 'Casual', icon: '😊' },
  { value: 'poetic', label: 'Poetic', icon: '🌟' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CreateSection: React.FC<CreateSectionProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  selectedAssetIds,
  expanded,
  onToggle,
  initialFeature,
}) => {
  const [activeFeature, setActiveFeature] = useState<'story' | 'captions' | 'hashtags' | null>(
    initialFeature || null
  );
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('professional');
  const [captionCount, setCaptionCount] = useState(3);
  const [captionResults, setCaptionResults] = useState<Map<string, CaptionResult>>(new Map());
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);

  const [hashtagCount, setHashtagCount] = useState(15);
  const [aggregatedHashtags, setAggregatedHashtags] = useState<string[]>([]);
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);
  const [hashtagError, setHashtagError] = useState<string | null>(null);

  const hasSelection = selectedAssetIds.length > 0;

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
        count: Math.ceil(hashtagCount / selectedAssetIds.length) + 5,
      };

      for (const assetId of selectedAssetIds) {
        try {
          const result = await HashtagService.generateHashtags(workspaceId, assetId, request);
          result.hashtags.forEach((tag) => allHashtags.add(tag.toLowerCase()));
        } catch (err) {
          console.error(`Failed to generate hashtags for asset ${assetId}:`, err);
        }
      }

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

  const description = hasSelection
    ? `${selectedAssetIds.length} photo${selectedAssetIds.length === 1 ? '' : 's'} selected`
    : 'Stories, captions, hashtags';

  return (
    <FeatureCard
      title="Create"
      description={description}
      icon={<Wand2 className="w-4 h-4" />}
      status="idle"
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        {/* Story Generation */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveFeature(activeFeature === 'story' ? null : 'story')}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Gallery Story</p>
              <p className="text-xs text-text-secondary">AI-written narrative for your gallery</p>
            </div>
          </button>
          {activeFeature === 'story' && (
            <div className="pl-4 border-l-2 border-primary/20">
              <StoryGenerator
                workspaceId={workspaceId}
                galleryId={galleryId}
                galleryName={galleryName}
                photoCount={totalPhotos}
                className="border-0 shadow-none p-0"
              />
            </div>
          )}
        </div>

        {/* Caption Generation */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveFeature(activeFeature === 'captions' ? null : 'captions')}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Batch Captions</p>
              <p className="text-xs text-text-secondary">
                Generate captions for {hasSelection ? selectedAssetIds.length : 0} selected photos
              </p>
            </div>
          </button>
          {activeFeature === 'captions' && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-4">
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
                  {captionError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600">
                      {captionError}
                    </div>
                  )}
                  {captionResults.size > 0 && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                      <p className="text-sm font-medium text-emerald-600">
                        Generated {captionResults.size} captions
                      </p>
                    </div>
                  )}
                  <AppButton
                    variant="primary"
                    fullWidth
                    onClick={handleGenerateCaptions}
                    isLoading={isGeneratingCaptions}
                    leftIcon={<Wand2 className="w-4 h-4" />}
                  >
                    Generate Captions for {selectedAssetIds.length} Photos
                  </AppButton>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hashtag Generation */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveFeature(activeFeature === 'hashtags' ? null : 'hashtags')}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Hash className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Aggregate Hashtags</p>
              <p className="text-xs text-text-secondary">Combine hashtags from selected photos</p>
            </div>
          </button>
          {activeFeature === 'hashtags' && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-4">
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
                  {hashtagError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600">
                      {hashtagError}
                    </div>
                  )}
                  {aggregatedHashtags.length > 0 && (
                    <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {aggregatedHashtags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <AppButton
                    variant="primary"
                    fullWidth
                    onClick={handleGenerateHashtags}
                    isLoading={isGeneratingHashtags}
                    leftIcon={<Sparkles className="w-4 h-4" />}
                  >
                    Generate Hashtags from {selectedAssetIds.length} Photos
                  </AppButton>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </FeatureCard>
  );
};
