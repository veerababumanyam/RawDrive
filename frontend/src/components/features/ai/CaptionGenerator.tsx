/**
 * CaptionGenerator Component
 * Feature: 010-ai-powered-features
 * Tasks: T026 - Create frontend CaptionGenerator component
 *        T028 - Implement caption copy-to-clipboard functionality
 *
 * AI-powered caption generation with style options
 */

import React, { useState, useCallback } from 'react';
import {
  MessageSquare,
  Wand2,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import { CaptionService } from '@/services/captionService';
import type { CaptionResult, GenerateCaptionsRequest } from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionGeneratorProps {
  /** Workspace ID */
  workspaceId: string;
  /** Asset ID to generate captions for */
  assetId: string;
  /** Photo filename for display */
  filename?: string;
  /** Optional callback when captions are generated */
  onCaptionsGenerated?: (result: CaptionResult) => void;
  /** Optional custom class name */
  className?: string;
  /** Compact mode for inline usage */
  compact?: boolean;
}

type CaptionStyle = 'professional' | 'casual' | 'poetic';

const STYLE_OPTIONS: { value: CaptionStyle; label: string; description: string; icon: string }[] = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Business-appropriate, polished language',
    icon: '🎯',
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Friendly, conversational tone',
    icon: '😊',
  },
  {
    value: 'poetic',
    label: 'Poetic',
    description: 'Artistic, metaphorical language',
    icon: '🌟',
  },
];

const COUNT_OPTIONS = [1, 3, 5];


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CaptionGenerator: React.FC<CaptionGeneratorProps> = ({
  workspaceId,
  assetId,
  filename,
  onCaptionsGenerated,
  className = '',
  compact = false,
}) => {
  // Form state
  const [style, setStyle] = useState<CaptionStyle>('professional');
  const [count, setCount] = useState(3);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptionResult | null>(null);

  // UI state
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  // Generate captions
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const request: GenerateCaptionsRequest = { style, count };
      const captionResult = await CaptionService.generateCaptions(
        workspaceId,
        assetId,
        request
      );

      setResult(captionResult);
      onCaptionsGenerated?.(captionResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Caption generation failed';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, assetId, style, count, onCaptionsGenerated]);

  // Copy caption
  const handleCopy = useCallback(async (caption: string, index: number) => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      setError('Failed to copy');
    }
  }, []);

  // Copy all captions
  const handleCopyAll = useCallback(async () => {
    if (!result?.captions) return;
    try {
      await navigator.clipboard.writeText(result.captions.join('\n\n'));
      setCopiedIndex(-1); // Use -1 to indicate "all"
      setTimeout(() => setCopiedIndex(null), 2000);
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
    <AIErrorBoundary featureName="Caption Generator">
      <div className={`bg-surface rounded-card border border-border ${compact ? 'p-4' : 'p-6'} ${className}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-text-primary`}>
              Caption Generator
            </h3>
            {filename && (
              <p className="text-sm text-text-secondary truncate">{filename}</p>
            )}
          </div>
        </div>

        {/* Options (when not showing results) */}
        {!result && !isGenerating && (
          <div className="space-y-4 mb-4">
            {/* Style selector */}
            <div className="relative">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Caption Style
              </label>
              <button
                onClick={() => setShowStyleDropdown(!showStyleDropdown)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
                aria-expanded={showStyleDropdown}
                aria-haspopup="listbox"
              >
                <span>
                  {STYLE_OPTIONS.find((o) => o.value === style)?.icon}{' '}
                  {STYLE_OPTIONS.find((o) => o.value === style)?.label}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showStyleDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showStyleDropdown && (
                <ul
                  role="listbox"
                  className="absolute z-10 w-full mt-1 ai-dropdown py-1"
                >
                  {STYLE_OPTIONS.map((option) => (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={style === option.value}
                      onClick={() => {
                        setStyle(option.value);
                        setShowStyleDropdown(false);
                      }}
                      className={`ai-dropdown-item ${
                        style === option.value ? 'selected' : 'text-text-primary'
                      }`}
                    >
                      <div>
                        <span className="font-medium">
                          {option.icon} {option.label}
                        </span>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Count selector */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Number of Captions
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
          </div>
        )}

        {/* Loading state */}
        {isGenerating && (
          <div className="mb-4">
            <AISpinner featureType="caption" />
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
          <div className="space-y-3 mb-4">
            {/* Style badge */}
            <div className="flex items-center justify-between">
              <span className="ai-tag ai-tag-accent">
                {STYLE_OPTIONS.find((o) => o.value === result.style)?.icon}{' '}
                {result.style}
              </span>
              <button
                onClick={handleCopyAll}
                className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                aria-label="Copy all captions"
              >
                {copiedIndex === -1 ? (
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

            {/* Captions list */}
            {result.captions.map((caption, index) => (
              <div
                key={index}
                className="ai-result-card p-4 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-text-primary leading-relaxed flex-1">
                    {caption}
                  </p>
                  <button
                    onClick={() => handleCopy(caption, index)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-accent transition-all"
                    aria-label={`Copy caption ${index + 1}`}
                  >
                    {copiedIndex === index ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}

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
                New Style
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
            Generate Captions
          </AppButton>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default CaptionGenerator;
