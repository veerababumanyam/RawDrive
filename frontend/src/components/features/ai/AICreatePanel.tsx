/**
 * AICreatePanel Component
 *
 * Panel for AI content generation (US6): stories, captions, and hashtags.
 * Standalone panel separate from filtering, triggered by explicit button.
 *
 * Feature: 025-ai-filter-simplify
 */

import React, { useState, useCallback, useId } from 'react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import {
  Sparkles,
  FileText,
  MessageSquare,
  Hash,
  Clipboard,
  Check,
  RefreshCw,
  X,
} from 'lucide-react';
import type { AICreateMode, AICreateRequest, AICreateResult } from '../../../types/aiFilter';

interface AICreatePanelProps {
  selectedAssetIds: string[];
  onGenerate: (request: AICreateRequest) => Promise<AICreateResult>;
  onClose?: () => void;
  isOpen?: boolean;
}

const MODES: { value: AICreateMode; label: string; icon: React.FC<{ className?: string }>; description: string }[] = [
  {
    value: 'story',
    label: 'Story',
    icon: FileText,
    description: 'Create a narrative from your photos',
  },
  {
    value: 'caption',
    label: 'Captions',
    icon: MessageSquare,
    description: 'Generate social media captions',
  },
  {
    value: 'hashtags',
    label: 'Hashtags',
    icon: Hash,
    description: 'Get relevant hashtags',
  },
];

const STYLES = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'poetic', label: 'Poetic' },
  { value: 'minimalist', label: 'Minimalist' },
];

const TONES = [
  { value: 'warm', label: 'Warm' },
  { value: 'formal', label: 'Formal' },
  { value: 'playful', label: 'Playful' },
  { value: 'emotional', label: 'Emotional' },
];

export const AICreatePanel: React.FC<AICreatePanelProps> = ({
  selectedAssetIds,
  onGenerate,
  onClose,
  isOpen = true,
}) => {
  const [mode, setMode] = useState<AICreateMode>('story');
  const [style, setStyle] = useState('professional');
  const [tone, setTone] = useState('warm');
  const [maxLength, setMaxLength] = useState<number | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<AICreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const panelId = useId();
  const resultId = useId();

  const handleGenerate = useCallback(async () => {
    if (selectedAssetIds.length === 0) {
      setError('Please select at least one photo');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const response = await onGenerate({
        mode,
        asset_ids: selectedAssetIds,
        style,
        tone,
        max_length: maxLength,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedAssetIds, mode, style, tone, maxLength, onGenerate]);

  const handleCopy = useCallback(async () => {
    if (!result?.content) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [result?.content]);

  const handleRegenerate = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  if (!isOpen) return null;

  return (
    <div
      className="bg-surface-primary border border-border-primary rounded-xl shadow-lg overflow-hidden"
      role="dialog"
      aria-labelledby={`${panelId}-title`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-secondary bg-surface-secondary">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 id={`${panelId}-title`} className="font-semibold text-text-primary">
            AI Create
          </h3>
          <span className="text-xs text-text-tertiary bg-surface-tertiary px-2 py-0.5 rounded-full">
            {selectedAssetIds.length} photos
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded"
            aria-label="Close AI Create panel"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Mode Selection */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">
            Content Type
          </label>
          <div role="radiogroup" aria-label="Content type" className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  role="radio"
                  aria-checked={mode === m.value}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                    mode === m.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border-secondary hover:border-border-primary text-text-secondary hover:text-text-primary'
                  }`}
                  title={m.description}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Style & Tone (two columns) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${panelId}-style`} className="block text-xs font-medium text-text-secondary mb-1.5">
              Style
            </label>
            <select
              id={`${panelId}-style`}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-secondary border border-border-secondary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${panelId}-tone`} className="block text-xs font-medium text-text-secondary mb-1.5">
              Tone
            </label>
            <select
              id={`${panelId}-tone`}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-secondary border border-border-secondary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Max Length (optional) */}
        {mode !== 'hashtags' && (
          <div>
            <label htmlFor={`${panelId}-length`} className="block text-xs font-medium text-text-secondary mb-1.5">
              Max Length (optional)
            </label>
            <AppInput
              id={`${panelId}-length`}
              type="number"
              min={50}
              max={5000}
              step={50}
              inputSize="sm"
              placeholder="No limit"
              value={maxLength ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setMaxLength(val ? parseInt(val, 10) : undefined);
              }}
              className="w-full"
            />
          </div>
        )}

        {/* Generate Button */}
        <AppButton
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleGenerate}
          disabled={isGenerating || selectedAssetIds.length === 0}
          aria-busy={isGenerating}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate {MODES.find((m) => m.value === mode)?.label}
            </>
          )}
        </AppButton>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div id={resultId} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Generated {MODES.find((m) => m.value === result.mode)?.label}
              </span>
              <div className="flex items-center gap-1">
                {result.tokens_used && (
                  <span className="text-xs text-text-tertiary mr-2">
                    ~{result.tokens_used} tokens
                  </span>
                )}
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  aria-label="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Clipboard className="w-4 h-4" />
                  )}
                </AppButton>
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  aria-label="Regenerate content"
                >
                  <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                </AppButton>
              </div>
            </div>
            <div className="p-3 bg-surface-secondary border border-border-secondary rounded-lg">
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans">
                {result.content}
              </pre>
            </div>
          </div>
        )}

        {/* Empty State */}
        {selectedAssetIds.length === 0 && (
          <p className="text-xs text-text-tertiary text-center py-2">
            Select photos in the gallery to generate AI content
          </p>
        )}
      </div>
    </div>
  );
};
