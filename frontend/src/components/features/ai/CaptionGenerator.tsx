/**
 * CaptionGenerator Component
 * Generate AI-powered captions with tone selection
 * Feature: AI-powered photo features (US2)
 */

import React, { useState, useCallback } from 'react';
import { MessageSquare, Copy, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useToast } from '../../ui/Toast';
import { CaptionService } from '../../../services/captionService';
import type { CaptionResult } from '../../../types/aiFeatures';

interface CaptionGeneratorProps {
  workspaceId: string;
  assetId: string;
  onCaptionSelected?: (caption: string) => void;
}

type CaptionStyle = 'professional' | 'casual' | 'poetic';

const styleDescriptions: Record<CaptionStyle, string> = {
  professional: 'Polished and business-appropriate',
  casual: 'Friendly and conversational',
  poetic: 'Artistic and evocative',
};

export const CaptionGenerator: React.FC<CaptionGeneratorProps> = ({
  workspaceId,
  assetId,
  onCaptionSelected,
}) => {
  const [style, setStyle] = useState<CaptionStyle>('professional');
  const [result, setResult] = useState<CaptionResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { addToast } = useToast();

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const captionResult = await CaptionService.generateCaptions(workspaceId, assetId, {
        style,
        count: 3,
      });

      setResult(captionResult);
      addToast({ message: 'Captions generated', variant: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate captions';

      if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
        setError('AI features require a Gemini API key. Configure it in Settings > AI & Gemini.');
      } else {
        setError(errorMessage);
      }

      addToast({ message: 'Generation failed', variant: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, assetId, style, addToast]);

  const handleCopy = useCallback(async (caption: string, index: number) => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedIndex(index);
      addToast({ message: 'Caption copied to clipboard', variant: 'success' });
      onCaptionSelected?.(caption);

      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      addToast({ message: 'Failed to copy', variant: 'error' });
    }
  }, [addToast, onCaptionSelected]);

  return (
    <AppCard padding="md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent" />
          Caption Generator
        </h3>
      </div>

      {/* Style Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Select Tone
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['professional', 'casual', 'poetic'] as CaptionStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                style === s
                  ? 'bg-accent text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-border'
              }`}
              aria-pressed={style === s}
            >
              <span className="capitalize">{s}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          {styleDescriptions[style]}
        </p>
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
            <MessageSquare className="w-4 h-4" />
          )
        }
      >
        {isGenerating ? 'Generating...' : 'Generate Captions'}
      </AppButton>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-error/10 rounded-lg text-error text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && result.captions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">
              Generated in <span className="capitalize">{result.style}</span> style
            </span>
            <AppButton
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Regenerate
            </AppButton>
          </div>

          {result.captions.map((caption, index) => (
            <div
              key={index}
              className="group p-3 bg-surface-hover rounded-lg hover:bg-border transition-colors"
            >
              <p className="text-sm text-text-primary mb-2">{caption}</p>
              <button
                onClick={() => handleCopy(caption, index)}
                className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent transition-colors"
                aria-label={`Copy caption ${index + 1}`}
              >
                {copiedIndex === index ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span className="text-success">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </AppCard>
  );
};

export default CaptionGenerator;
