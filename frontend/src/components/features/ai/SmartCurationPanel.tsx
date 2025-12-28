// Smart Curation Panel Component
// Feature: AI-powered photo curation (US5)

import React, { useState, useCallback } from 'react';
import { Wand2, Loader2, RefreshCw, Check, Image, Sparkles, SlidersHorizontal } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { CurationService } from '@/services/curationService';
import type { CurationResult, SmartCurationRequest } from '@/types/aiFeatures';

interface SmartCurationPanelProps {
  workspaceId: string;
  galleryId: string;
  totalPhotos: number;
  onCurationComplete?: (result: CurationResult) => void;
  onSelectPhotos?: (assetIds: string[]) => void;
}

const QUALITY_PRESETS = [
  { value: 50, label: 'Include More', description: 'Lower threshold, more variety' },
  { value: 70, label: 'Balanced', description: 'Good quality selection' },
  { value: 85, label: 'Best Only', description: 'Only highest quality' },
];

const DIVERSITY_PRESETS = [
  { value: 0.2, label: 'Similar', description: 'Allow similar photos' },
  { value: 0.5, label: 'Balanced', description: 'Moderate variety' },
  { value: 0.8, label: 'Diverse', description: 'Maximum variety' },
];

export const SmartCurationPanel: React.FC<SmartCurationPanelProps> = ({
  workspaceId,
  galleryId,
  totalPhotos,
  onCurationComplete,
  onSelectPhotos,
}) => {
  const { addToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CurationResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [qualityThreshold, setQualityThreshold] = useState(70);
  const [diversityWeight, setDiversityWeight] = useState(0.5);

  const pollJobStatus = useCallback(async (jobId: string): Promise<CurationResult | null> => {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await CurationService.getCurationJobStatus(workspaceId, jobId);

      if (status.status === 'completed' && status.result) {
        return status.result;
      }

      if (status.status === 'failed') {
        throw new Error(status.message || 'Curation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Curation timed out');
  }, [workspaceId]);

  const handleCurate = useCallback(async () => {
    if (totalPhotos < 5) {
      addToast({ message: 'Need at least 5 photos for smart curation', variant: 'warning' });
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const request: SmartCurationRequest = {
        criteria: {
          quality_threshold: qualityThreshold,
          diversity_weight: diversityWeight,
        },
      };

      const job = await CurationService.curateGallery(workspaceId, galleryId, request);
      const curationResult = await pollJobStatus(job.job_id);

      if (curationResult) {
        setResult(curationResult);
        onCurationComplete?.(curationResult);
        addToast({
          message: `Selected ${curationResult.selected_count} of ${curationResult.total_assets} photos`,
          variant: 'success',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to curate photos';
      setError(message);
      addToast({ message, variant: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [
    workspaceId,
    galleryId,
    totalPhotos,
    qualityThreshold,
    diversityWeight,
    pollJobStatus,
    onCurationComplete,
    addToast,
  ]);

  const handleApplySelection = useCallback(() => {
    if (result?.asset_ids) {
      onSelectPhotos?.(result.asset_ids);
      addToast({ message: 'Selection applied to gallery', variant: 'success' });
    }
  }, [result, onSelectPhotos, addToast]);

  const selectionPercentage = result
    ? Math.round((result.selected_count / result.total_assets) * 100)
    : 0;

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-accent/10">
          <Wand2 className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Smart Curation</h3>
          <p className="text-sm text-text-tertiary">
            AI selects the best photos from your gallery
          </p>
        </div>
      </div>

      {/* Configuration */}
      {!result && (
        <div className="space-y-6 mb-6">
          {/* Quick Presets */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Quality Selection
            </label>
            <div className="grid grid-cols-3 gap-3">
              {QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setQualityThreshold(preset.value)}
                  disabled={isProcessing}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    qualityThreshold === preset.value
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border hover:border-accent/50 text-text-secondary'
                  } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-sm">{preset.label}</div>
                  <div className="text-xs text-text-tertiary mt-1">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 p-4 rounded-lg bg-surface-hover border border-border">
              {/* Quality Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Quality Threshold
                  </label>
                  <span className="text-sm text-text-tertiary">{qualityThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="95"
                  value={qualityThreshold}
                  onChange={(e) => setQualityThreshold(Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <div className="flex justify-between text-xs text-text-tertiary mt-1">
                  <span>More photos</span>
                  <span>Higher quality</span>
                </div>
              </div>

              {/* Diversity Weight */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Diversity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DIVERSITY_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setDiversityWeight(preset.value)}
                      disabled={isProcessing}
                      className={`p-2 rounded-lg border text-center transition-all text-xs ${
                        diversityWeight === preset.value
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-border hover:border-accent/50 text-text-secondary'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-error/10 border border-error/20">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div className="mb-6">
          {/* Results Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                <span className="font-medium text-text-primary">Curation Complete</span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-lg bg-surface-hover text-center">
              <div className="text-2xl font-bold text-text-primary">
                {result.total_assets}
              </div>
              <div className="text-xs text-text-tertiary">Total Photos</div>
            </div>
            <div className="p-4 rounded-lg bg-accent/10 text-center">
              <div className="text-2xl font-bold text-accent">
                {result.selected_count}
              </div>
              <div className="text-xs text-text-tertiary">Selected</div>
            </div>
            <div className="p-4 rounded-lg bg-surface-hover text-center">
              <div className="text-2xl font-bold text-text-primary">
                {selectionPercentage}%
              </div>
              <div className="text-xs text-text-tertiary">Of Gallery</div>
            </div>
          </div>

          {/* Selection Criteria */}
          <div className="p-3 rounded-lg bg-surface-hover border border-border">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Image className="w-4 h-4" />
              <span>
                Quality threshold: {result.criteria.quality_threshold}%,
                Diversity: {Math.round((result.criteria.diversity_weight || 0.5) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {result ? (
          <>
            <AppButton
              variant="primary"
              onClick={handleApplySelection}
              className="flex-1"
            >
              <Check className="w-4 h-4 mr-2" />
              Apply Selection
            </AppButton>
            <AppButton
              variant="outline"
              onClick={() => setResult(null)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-curate
            </AppButton>
          </>
        ) : (
          <AppButton
            variant="primary"
            onClick={handleCurate}
            disabled={isProcessing || totalPhotos < 5}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Photos...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Curate Gallery
              </>
            )}
          </AppButton>
        )}
      </div>

      {/* Minimum Photos Warning */}
      {totalPhotos < 5 && (
        <p className="mt-3 text-sm text-text-tertiary text-center">
          Add at least 5 photos for smart curation
        </p>
      )}
    </div>
  );
};

export default SmartCurationPanel;
