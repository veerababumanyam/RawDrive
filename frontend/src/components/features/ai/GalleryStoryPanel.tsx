// Gallery Story Panel Component
// Feature: AI-powered gallery story generation (US4)

import React, { useState, useCallback } from 'react';
import { BookOpen, Copy, Check, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { StoryService } from '@/services/storyService';
import type { StoryResult, GenerateStoryRequest } from '@/types/aiFeatures';

interface GalleryStoryPanelProps {
  workspaceId: string;
  galleryId: string;
  photoCount: number;
  onStoryGenerated?: (story: StoryResult) => void;
}

type StoryLength = 'short' | 'medium' | 'long';
type StoryTone = 'professional' | 'casual' | 'poetic' | 'journalistic';

const LENGTH_OPTIONS: { value: StoryLength; label: string; description: string }[] = [
  { value: 'short', label: 'Short', description: '100-150 words' },
  { value: 'medium', label: 'Medium', description: '250-350 words' },
  { value: 'long', label: 'Long', description: '500-700 words' },
];

const TONE_OPTIONS: { value: StoryTone; label: string; icon: string }[] = [
  { value: 'professional', label: 'Professional', icon: '💼' },
  { value: 'casual', label: 'Casual', icon: '😊' },
  { value: 'poetic', label: 'Poetic', icon: '✨' },
  { value: 'journalistic', label: 'Journalistic', icon: '📰' },
];

export const GalleryStoryPanel: React.FC<GalleryStoryPanelProps> = ({
  workspaceId,
  galleryId,
  photoCount,
  onStoryGenerated,
}) => {
  const { addToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [story, setStory] = useState<StoryResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [length, setLength] = useState<StoryLength>('medium');
  const [tone, setTone] = useState<StoryTone>('professional');

  const handleGenerate = useCallback(async () => {
    if (photoCount < 3) {
      addToast({ message: 'Need at least 3 photos to generate a story', variant: 'warning' });
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStory(null);

    try {
      const request: GenerateStoryRequest = { length, tone };
      const result = await StoryService.generateStory(workspaceId, galleryId, request);
      setStory(result);
      onStoryGenerated?.(result);
      addToast({ message: 'Story generated successfully', variant: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate story';
      setError(message);
      addToast({ message, variant: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, galleryId, length, tone, photoCount, onStoryGenerated, addToast]);

  const handleCopy = useCallback(async () => {
    if (!story) return;

    try {
      await navigator.clipboard.writeText(story.story);
      setCopied(true);
      addToast({ message: 'Story copied to clipboard', variant: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ message: 'Failed to copy story', variant: 'error' });
    }
  }, [story, addToast]);

  const wordCount = story?.word_count ?? (story ? story.story.split(/\s+/).length : 0);

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Gallery Story</h3>
          <p className="text-sm text-text-tertiary">
            Generate a narrative from your {photoCount} photos
          </p>
        </div>
      </div>

      {/* Configuration */}
      {!story && (
        <div className="space-y-6 mb-6">
          {/* Length Selection */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Story Length
            </label>
            <div className="grid grid-cols-3 gap-3">
              {LENGTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setLength(option.value)}
                  disabled={isGenerating}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    length === option.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 text-text-secondary'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-text-tertiary mt-1">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tone Selection */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Story Tone
            </label>
            <div className="grid grid-cols-2 gap-3">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTone(option.value)}
                  disabled={isGenerating}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tone === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-lg mr-2">{option.icon}</span>
                  <span className={`font-medium text-sm ${
                    tone === option.value ? 'text-primary' : 'text-text-secondary'
                  }`}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-error/10 border border-error/20">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Story Display */}
      {story && (
        <div className="mb-6">
          {/* Story Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                {story.tone}
              </span>
              <span className="text-sm text-text-tertiary">
                {wordCount} words
              </span>
            </div>
            <AppButton
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="text-text-secondary"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </>
              )}
            </AppButton>
          </div>

          {/* Story Content */}
          <div className="p-4 rounded-lg bg-surface-hover border border-border">
            <p className="text-text-primary whitespace-pre-wrap leading-relaxed">
              {story.story}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {story ? (
          <>
            <AppButton
              variant="outline"
              onClick={() => setStory(null)}
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate New Story
            </AppButton>
          </>
        ) : (
          <AppButton
            variant="primary"
            onClick={handleGenerate}
            disabled={isGenerating || photoCount < 3}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Story...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Story
              </>
            )}
          </AppButton>
        )}
      </div>

      {/* Minimum Photos Warning */}
      {photoCount < 3 && (
        <p className="mt-3 text-sm text-text-tertiary text-center">
          Add at least 3 photos to generate a story
        </p>
      )}
    </div>
  );
};

export default GalleryStoryPanel;
