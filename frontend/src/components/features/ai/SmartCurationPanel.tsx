/**
 * SmartCurationPanel Component
 * Feature: 010-ai-powered-features
 * Tasks: T065 - Create frontend SmartCurationPanel component
 *
 * AI-powered photo selection with quality and diversity controls
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Wand2,
  Check,
  X,
  RefreshCw,
  Users,
  Star,
  Shuffle,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import { CurationService } from '@/services/curationService';
import type { CurationResult, SmartCurationRequest } from '@/types/aiFeatures';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmartCurationPanelProps {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID to curate */
  galleryId: string;
  /** Gallery name for display */
  galleryName: string;
  /** Total photos in gallery */
  totalPhotos: number;
  /** Callback when curation completes */
  onCurationComplete?: (result: CurationResult) => void;
  /** Callback when a photo is selected/deselected */
  onSelectionChange?: (selectedAssetIds: string[]) => void;
  /** Optional custom class name */
  className?: string;
}

interface CuratedPhoto {
  asset_id: string;
  score: number;
  quality_score: number;
  has_faces: boolean;
  thumbnail_url?: string;
  isSelected: boolean;
}


const COUNT_OPTIONS = [5, 10, 20, 30, 50];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SmartCurationPanel: React.FC<SmartCurationPanelProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  onCurationComplete,
  onSelectionChange,
  className = '',
}) => {
  // Settings state
  const [count, setCount] = useState(10);
  const [qualityThreshold, setQualityThreshold] = useState(0.6);
  const [diversityWeight, setDiversityWeight] = useState(0.3);
  const [preferPeople, setPreferPeople] = useState(false);

  // Curation state
  const [curatedPhotos, setCuratedPhotos] = useState<CuratedPhoto[]>([]);
  const [curationResult, setCurationResult] = useState<CurationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCurating, setIsCurating] = useState(false);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showCountDropdown, setShowCountDropdown] = useState(false);

  // Run curation
  const handleCurate = useCallback(async () => {
    setIsCurating(true);
    setError(null);
    setCurationResult(null);
    setCuratedPhotos([]);

    try {
      const request: SmartCurationRequest = {
        count,
        quality_threshold: qualityThreshold,
        diversity_weight: diversityWeight,
        prefer_people: preferPeople,
      };

      const result = await CurationService.curateGallery(workspaceId, galleryId, request);
      setCurationResult(result);
      setCuratedPhotos(
        result.selected_assets.map((asset) => ({
          ...asset,
          isSelected: true,
        }))
      );
      onCurationComplete?.(result);
      onSelectionChange?.(result.selected_assets.map((asset) => asset.asset_id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Smart curation failed';
      setError(message);
    } finally {
      setIsCurating(false);
    }
  }, [
    workspaceId,
    galleryId,
    count,
    qualityThreshold,
    diversityWeight,
    preferPeople,
    onCurationComplete,
    onSelectionChange,
  ]);

  // Toggle photo selection
  const togglePhotoSelection = useCallback(
    (assetId: string) => {
      setCuratedPhotos((prev) => {
        const updated = prev.map((photo) =>
          photo.asset_id === assetId ? { ...photo, isSelected: !photo.isSelected } : photo
        );
        const selectedIds = updated.filter((p) => p.isSelected).map((p) => p.asset_id);
        onSelectionChange?.(selectedIds);
        return updated;
      });
    },
    [onSelectionChange]
  );

  // Select/deselect all
  const selectAll = useCallback(() => {
    setCuratedPhotos((prev) => {
      const updated = prev.map((photo) => ({ ...photo, isSelected: true }));
      onSelectionChange?.(updated.map((p) => p.asset_id));
      return updated;
    });
  }, [onSelectionChange]);

  const deselectAll = useCallback(() => {
    setCuratedPhotos((prev) => {
      const updated = prev.map((photo) => ({ ...photo, isSelected: false }));
      onSelectionChange?.([]);
      return updated;
    });
  }, [onSelectionChange]);

  // Re-run curation
  const handleRecurate = useCallback(() => {
    handleCurate();
  }, [handleCurate]);

  const selectedCount = curatedPhotos.filter((p) => p.isSelected).length;

  return (
    <AIErrorBoundary featureName="Smart Curation">
      <div className={`bg-surface rounded-card border border-border p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Smart Curation</h3>
              <p className="text-sm text-text-secondary">
                AI-powered selection of your best photos
              </p>
            </div>
          </div>
          {!isCurating && !curationResult && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
              aria-label="Toggle settings"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              />
            </AppButton>
          )}
        </div>

        {/* Settings */}
        {showSettings && !isCurating && !curationResult && (
          <div className="space-y-4 mb-6 pb-6 border-b border-border">
            {/* Count selector */}
            <div className="relative">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Number of photos to select
              </label>
              <button
                onClick={() => setShowCountDropdown(!showCountDropdown)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
                aria-expanded={showCountDropdown}
                aria-haspopup="listbox"
              >
                <span>{count} photos</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showCountDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showCountDropdown && (
                <ul
                  role="listbox"
                  className="absolute z-10 w-full mt-1 ai-dropdown py-1"
                >
                  {COUNT_OPTIONS.map((option) => (
                    <li
                      key={option}
                      role="option"
                      aria-selected={count === option}
                      onClick={() => {
                        setCount(option);
                        setShowCountDropdown(false);
                      }}
                      className={`ai-dropdown-item ${
                        count === option ? 'selected' : 'text-text-primary'
                      }`}
                    >
                      {option} photos
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quality threshold slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Star className="w-4 h-4 text-warning" />
                  Quality Threshold
                </label>
                <span className="text-sm text-text-secondary">
                  {Math.round(qualityThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={qualityThreshold * 100}
                onChange={(e) => setQualityThreshold(Number(e.target.value) / 100)}
                className="ai-range-input"
                aria-label="Quality threshold"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Minimum quality score for selected photos
              </p>
            </div>

            {/* Diversity weight slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-accent" />
                  Diversity Weight
                </label>
                <span className="text-sm text-text-secondary">
                  {Math.round(diversityWeight * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={diversityWeight * 100}
                onChange={(e) => setDiversityWeight(Number(e.target.value) / 100)}
                className="ai-range-input ai-range-accent"
                aria-label="Diversity weight"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Balance between variety and pure quality
              </p>
            </div>

            {/* Prefer people toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Users className="w-4 h-4 text-success" />
                Prefer photos with people
              </label>
              <button
                role="switch"
                aria-checked={preferPeople}
                onClick={() => setPreferPeople(!preferPeople)}
                className="ai-toggle"
              >
                <span className="ai-toggle-thumb" />
              </button>
            </div>
          </div>
        )}

        {/* Gallery info */}
        {!isCurating && !curationResult && (
          <div className="flex items-center gap-2 text-sm text-text-secondary bg-background rounded-lg px-4 py-2 mb-6">
            <ImageIcon className="w-4 h-4" />
            <span>
              {totalPhotos} photos in <strong>{galleryName}</strong>
            </span>
          </div>
        )}

        {/* Loading state */}
        {isCurating && (
          <div className="mb-6">
            <AISpinner featureType="curation" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg text-error"
            role="alert"
          >
            <p className="font-medium">Curation failed</p>
            <p className="text-sm mt-1 opacity-80">{error}</p>
          </div>
        )}

        {/* Results */}
        {curationResult && (
          <div className="mb-6">
            {/* Stats */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-text-secondary">
                Selected <strong className="text-text-primary">{selectedCount}</strong> of{' '}
                {curationResult.total_candidates} photos
              </div>
              <div className="flex gap-2">
                <AppButton variant="ghost" size="sm" onClick={selectAll}>
                  Select All
                </AppButton>
                <AppButton variant="ghost" size="sm" onClick={deselectAll}>
                  Deselect All
                </AppButton>
              </div>
            </div>

            {/* Photo grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
              {curatedPhotos.map((photo) => (
                <button
                  key={photo.asset_id}
                  onClick={() => togglePhotoSelection(photo.asset_id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    photo.isSelected
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  aria-pressed={photo.isSelected}
                  aria-label={`${photo.isSelected ? 'Deselect' : 'Select'} photo`}
                >
                  {photo.thumbnail_url ? (
                    <img
                      src={photo.thumbnail_url}
                      alt="Curated photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-text-tertiary" />
                    </div>
                  )}

                  {/* Selection indicator */}
                  <div
                    className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      photo.isSelected ? 'bg-primary text-white' : 'bg-black/50 text-white'
                    }`}
                  >
                    {photo.isSelected ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </div>

                  {/* Score badge */}
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 ai-photo-badge rounded text-xs flex items-center gap-1">
                    <Star className="w-3 h-3 text-warning" />
                    {Math.round(photo.score * 100)}
                  </div>

                  {/* Face indicator */}
                  {photo.has_faces && (
                    <div className="absolute bottom-1 right-1 p-1 ai-photo-badge rounded">
                      <Users className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Regenerate button */}
            <AppButton
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={handleRecurate}
            >
              Re-curate with different settings
            </AppButton>
          </div>
        )}

        {/* Curate button */}
        {!curationResult && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Wand2 className="w-4 h-4" />}
            onClick={handleCurate}
            isLoading={isCurating}
            loadingText="Curating..."
            disabled={isCurating}
          >
            Curate {count} Best Photos
          </AppButton>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default SmartCurationPanel;
