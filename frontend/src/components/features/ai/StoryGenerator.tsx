/**
 * StoryGenerator Component
 * Feature: 010-ai-powered-features
 * Tasks: T052 - Create frontend StoryGenerator component
 *
 * AI-powered gallery story generation with length/tone options
 */

import React, { useState, useCallback } from 'react';
import {
  BookOpen,
  Wand2,
  Copy,
  Check,
  RefreshCw,
  Download,
  ChevronDown,
  FileText,
  Hash,
  Code,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import { StoryService } from '@/services/storyService';
import type { StoryResult, GenerateStoryRequest } from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoryGeneratorProps {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID to generate story for */
  galleryId: string;
  /** Gallery name for display */
  galleryName: string;
  /** Number of photos in gallery */
  photoCount: number;
  /** Optional callback when story is generated */
  onStoryGenerated?: (story: StoryResult) => void;
  /** Optional custom class name */
  className?: string;
}

type StoryLength = 'short' | 'medium' | 'long';
type StoryTone = 'professional' | 'casual' | 'poetic' | 'journalistic';
type ExportFormat = 'text' | 'markdown' | 'html';

const LENGTH_OPTIONS: { value: StoryLength; label: string; description: string }[] = [
  { value: 'short', label: 'Short', description: '50-100 words' },
  { value: 'medium', label: 'Medium', description: '150-300 words' },
  { value: 'long', label: 'Long', description: '400-600 words' },
];

const TONE_OPTIONS: { value: StoryTone; label: string; icon: string }[] = [
  { value: 'professional', label: 'Professional', icon: '🎯' },
  { value: 'casual', label: 'Casual', icon: '😊' },
  { value: 'poetic', label: 'Poetic', icon: '🌟' },
  { value: 'journalistic', label: 'Journalistic', icon: '📰' },
];


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StoryGenerator: React.FC<StoryGeneratorProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  photoCount,
  onStoryGenerated,
  className = '',
}) => {
  // Form state
  const [length, setLength] = useState<StoryLength>('medium');
  const [tone, setTone] = useState<StoryTone>('professional');

  // Generation state
  const [story, setStory] = useState<StoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // UI state
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showLengthDropdown, setShowLengthDropdown] = useState(false);
  const [showToneDropdown, setShowToneDropdown] = useState(false);

  // Generate story
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setStory(null);

    try {
      const request: GenerateStoryRequest = { length, tone };
      const storyResult = await StoryService.generateStory(workspaceId, galleryId, request);
      setStory(storyResult);
      onStoryGenerated?.(storyResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate story';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, galleryId, length, tone, onStoryGenerated]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!story) return;
    try {
      await navigator.clipboard.writeText(story.story);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API failed - could show toast here if needed
      console.warn('Failed to copy to clipboard');
    }
  }, [story]);

  // Export story
  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!story) return;

      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case 'markdown':
          content = `# ${story.title}\n\n${story.story}\n\n---\n*Generated for ${galleryName} | ${story.word_count} words | ${story.tone} tone*`;
          mimeType = 'text/markdown';
          extension = 'md';
          break;
        case 'html':
          content = `<!DOCTYPE html>
<html>
<head><title>${story.title}</title></head>
<body>
<h1>${story.title}</h1>
<article>${story.story.replace(/\n/g, '<br>')}</article>
<footer><p><em>Generated for ${galleryName} | ${story.word_count} words</em></p></footer>
</body>
</html>`;
          mimeType = 'text/html';
          extension = 'html';
          break;
        default:
          content = `${story.title}\n\n${story.story}\n\n---\nGenerated for ${galleryName} | ${story.word_count} words`;
          mimeType = 'text/plain';
          extension = 'txt';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${galleryName.replace(/[^a-z0-9]/gi, '-')}-story.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    },
    [story, galleryName]
  );

  // Regenerate story
  const handleRegenerate = useCallback(() => {
    setStory(null);
    handleGenerate();
  }, [handleGenerate]);

  return (
    <AIErrorBoundary featureName="Story Generator">
      <div className={`bg-surface rounded-card border border-border p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Story Generator</h3>
            <p className="text-sm text-text-secondary">
              Create an AI-written narrative for your gallery
            </p>
          </div>
        </div>

        {/* Generation Options */}
        {!story && !isGenerating && (
          <div className="space-y-4 mb-6">
            {/* Length selector */}
            <div className="relative">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Story Length
              </label>
              <button
                onClick={() => setShowLengthDropdown(!showLengthDropdown)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
                aria-expanded={showLengthDropdown}
                aria-haspopup="listbox"
              >
                <span>
                  {LENGTH_OPTIONS.find((o) => o.value === length)?.label} -{' '}
                  {LENGTH_OPTIONS.find((o) => o.value === length)?.description}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showLengthDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showLengthDropdown && (
                <ul
                  role="listbox"
                  className="absolute z-10 w-full mt-1 ai-dropdown py-1"
                >
                  {LENGTH_OPTIONS.map((option) => (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={length === option.value}
                      onClick={() => {
                        setLength(option.value);
                        setShowLengthDropdown(false);
                      }}
                      className={`ai-dropdown-item ${
                        length === option.value ? 'selected' : 'text-text-primary'
                      }`}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-text-secondary ml-2">{option.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Tone selector */}
            <div className="relative">
              <label className="block text-sm font-medium text-text-primary mb-2">Tone</label>
              <button
                onClick={() => setShowToneDropdown(!showToneDropdown)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
                aria-expanded={showToneDropdown}
                aria-haspopup="listbox"
              >
                <span>
                  {TONE_OPTIONS.find((o) => o.value === tone)?.icon}{' '}
                  {TONE_OPTIONS.find((o) => o.value === tone)?.label}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showToneDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showToneDropdown && (
                <ul
                  role="listbox"
                  className="absolute z-10 w-full mt-1 ai-dropdown py-1"
                >
                  {TONE_OPTIONS.map((option) => (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={tone === option.value}
                      onClick={() => {
                        setTone(option.value);
                        setShowToneDropdown(false);
                      }}
                      className={`ai-dropdown-item ${
                        tone === option.value ? 'selected' : 'text-text-primary'
                      }`}
                    >
                      {option.icon} {option.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Gallery info */}
            <div className="flex items-center gap-2 text-sm text-text-secondary bg-background rounded-lg px-4 py-2">
              <Hash className="w-4 h-4" />
              <span>
                {photoCount} photos in <strong>{galleryName}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && (
          <div className="mb-6">
            <AISpinner featureType="story" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg text-error"
            role="alert"
          >
            <p className="font-medium">Generation failed</p>
            <p className="text-sm mt-1 opacity-80">{error}</p>
          </div>
        )}

        {/* Story result */}
        {story && (
          <div className="mb-6">
            {/* Story title */}
            <h4 className="text-xl font-semibold text-text-primary mb-3">{story.title}</h4>

            {/* Story content */}
            <div className="ai-result-card p-4 mb-4">
              <p className="text-text-primary whitespace-pre-line leading-relaxed">
                {story.story}
              </p>
            </div>

            {/* Story metadata */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="ai-tag ai-tag-accent">
                {story.word_count} words
              </span>
              <span className="ai-tag ai-tag-primary">
                {story.length}
              </span>
              <span className="ai-tag ai-tag-success">
                {story.tone}
              </span>
              {story.themes.map((theme) => (
                <span
                  key={theme}
                  className="ai-tag"
                >
                  #{theme}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <AppButton
                variant="outline"
                size="sm"
                leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                onClick={handleCopy}
                aria-label={copied ? 'Copied!' : 'Copy story to clipboard'}
              >
                {copied ? 'Copied!' : 'Copy'}
              </AppButton>

              {/* Export dropdown */}
              <div className="relative">
                <AppButton
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  rightIcon={<ChevronDown className="w-3 h-3" />}
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  aria-expanded={showExportMenu}
                  aria-haspopup="menu"
                >
                  Export
                </AppButton>
                {showExportMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1 w-40 ai-dropdown py-1 z-10"
                  >
                    <button
                      role="menuitem"
                      onClick={() => handleExport('text')}
                      className="w-full flex items-center gap-2 ai-dropdown-item text-left text-sm"
                    >
                      <FileText className="w-4 h-4" /> Plain Text
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleExport('markdown')}
                      className="w-full flex items-center gap-2 ai-dropdown-item text-left text-sm"
                    >
                      <Hash className="w-4 h-4" /> Markdown
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleExport('html')}
                      className="w-full flex items-center gap-2 ai-dropdown-item text-left text-sm"
                    >
                      <Code className="w-4 h-4" /> HTML
                    </button>
                  </div>
                )}
              </div>

              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleRegenerate}
                aria-label="Regenerate story"
              >
                Regenerate
              </AppButton>
            </div>
          </div>
        )}

        {/* Generate button */}
        {!story && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Wand2 className="w-4 h-4" />}
            onClick={handleGenerate}
            isLoading={isGenerating}
            loadingText="Generating..."
            disabled={isGenerating}
          >
            Generate Story
          </AppButton>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default StoryGenerator;
