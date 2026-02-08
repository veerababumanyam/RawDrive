/**
 * Cover Photo Section Component - Gallery Design Studio
 *
 * Complete cover photo configuration including:
 * - Photo selection from gallery assets (T007)
 * - Focal point adjustment with drag interface (T008)
 * - Overlay opacity slider for text readability (T009)
 * - Title visibility toggle (T010)
 *
 * Feature: Gallery Design Studio - Cover Photo Configuration (Phase 2)
 * Tasks: T007-T010
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CoverConfig, FocalPoint } from '../../../../types/gallery-design';
import { FocalPointPicker } from './FocalPointPicker';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { galleryDesignService } from '../../../../services/galleryDesignService';
import { Image as ImageIcon, Eye, EyeOff, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface CoverPhotoSectionProps {
  config: CoverConfig;
  galleryId: string;
  workspaceId: string;
  onChange: (updates: Partial<CoverConfig>) => void;
  disabled?: boolean;
}

interface GalleryAsset {
  asset_id: string;
  gallery_asset_id: string;
  visible: boolean;
  asset: {
    filename: string;
    type: string;
    width?: number;
    height?: number;
    thumbnail_url?: string;
    preview_url?: string;
    date_taken?: string;
  };
}

export const CoverPhotoSection: React.FC<CoverPhotoSectionProps> = ({
  config,
  galleryId,
  workspaceId,
  onChange,
  disabled = false,
}) => {
  // State for photo selection
  const [isPhotoSelectorOpen, setIsPhotoSelectorOpen] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryAsset[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | undefined>(config.imageUrl);

  // Fetch gallery photos when selector opens
  useEffect(() => {
    if (isPhotoSelectorOpen && galleryPhotos.length === 0 && galleryId && workspaceId) {
      fetchGalleryPhotos();
    }
  }, [isPhotoSelectorOpen, galleryId, workspaceId]);

  // Update selected photo URL when config changes
  useEffect(() => {
    if (config.imageUrl) {
      setSelectedPhotoUrl(config.imageUrl);
    }
  }, [config.imageUrl]);

  const fetchGalleryPhotos = async () => {
    try {
      setLoadingPhotos(true);
      const response = await galleryDesignService.getGalleryAssets(
        galleryId,
        workspaceId,
        1,
        20 // Fetch up to 20 photos for selection
      );
      setGalleryPhotos(response.data);
    } catch (error) {
      console.error('Failed to fetch gallery photos:', error);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handlePhotoSelect = useCallback((asset: GalleryAsset) => {
    const imageUrl = asset.asset.preview_url || asset.asset.thumbnail_url;
    setSelectedPhotoUrl(imageUrl);
    onChange({
      assetId: asset.asset_id,
      imageUrl: imageUrl,
    });
    setIsPhotoSelectorOpen(false);
  }, [onChange]);

  const handleFocalPointChange = useCallback((focalPoint: FocalPoint) => {
    onChange({ focalPoint });
  }, [onChange]);

  const handleOverlayOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ overlayOpacity: parseFloat(e.target.value) });
  }, [onChange]);

  const handleTitleVisibilityToggle = useCallback(() => {
    onChange({ titleVisible: !config.titleVisible });
  }, [config.titleVisible, onChange]);

  return (
    <div className="space-y-6">
      {/* Cover Photo Selection (T007) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Cover photo</h3>
          <DesignStudioTooltip content="Select a photo from your gallery to use as the cover">
            <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
          </DesignStudioTooltip>
        </div>

        {/* Selected Photo Preview / Selector Trigger */}
        <button
          onClick={() => setIsPhotoSelectorOpen(!isPhotoSelectorOpen)}
          disabled={disabled}
          className={`w-full group relative rounded-2xl border overflow-hidden transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
            isPhotoSelectorOpen
              ? 'border-cyan-400 bg-cyan-400/10'
              : 'border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {selectedPhotoUrl ? (
            <div className="aspect-video relative">
              <img
                src={selectedPhotoUrl}
                alt="Selected cover"
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${config.focalPoint.x}% ${config.focalPoint.y}%`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-white/90 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
                  Change photo
                </span>
                {isPhotoSelectorOpen ? (
                  <ChevronUp className="w-4 h-4 text-white/80" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/80" />
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center p-6 text-center">
              <ImageIcon className="w-8 h-8 text-gray-400 dark:text-white/30 mb-2 group-hover:text-cyan-400 transition-colors" />
              <span className="text-xs font-medium text-gray-600 dark:text-white/50 group-hover:text-gray-900 dark:group-hover:text-white/70">
                Select cover photo
              </span>
              {isPhotoSelectorOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-400 dark:text-white/40 mt-1" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/40 mt-1" />
              )}
            </div>
          )}
        </button>

        {/* Photo Selector Dropdown */}
        {isPhotoSelectorOpen && (
          <div className="mt-2 p-3 rounded-2xl border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-black/20 backdrop-blur-md">
            {loadingPhotos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                <span className="ml-2 text-xs text-gray-500 dark:text-white/50">Loading photos...</span>
              </div>
            ) : galleryPhotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ImageIcon className="w-8 h-8 text-gray-400 dark:text-white/30 mb-2" />
                <span className="text-xs text-gray-500 dark:text-white/50">No photos in gallery</span>
                <span className="text-[10px] text-gray-400 dark:text-white/30 mt-1">Upload photos to your gallery first</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {galleryPhotos.map((asset) => {
                  const imageUrl = asset.asset.thumbnail_url || asset.asset.preview_url;
                  const isSelected = config.assetId === asset.asset_id;

                  return (
                    <button
                      key={asset.asset_id}
                      onClick={() => handlePhotoSelect(asset)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                        isSelected
                          ? 'border-cyan-400 ring-2 ring-cyan-400/30'
                          : 'border-transparent hover:border-gray-400 dark:hover:border-white/20'
                      }`}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={asset.asset.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 dark:bg-white/10 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-cyan-400/20 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Focal Point Picker (T008) */}
      {selectedPhotoUrl && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Focal point</h3>
            <DesignStudioTooltip content="Set the focal point to control how the cover image is cropped on different devices">
              <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
            </DesignStudioTooltip>
          </div>
          <FocalPointPicker
            imageUrl={selectedPhotoUrl}
            focalPoint={config.focalPoint}
            onChange={handleFocalPointChange}
          />
        </div>
      )}

      {/* Overlay Opacity Slider (T009) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Text overlay</h3>
            <DesignStudioTooltip content="Adjust the overlay darkness to improve text readability on the cover">
              <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
            </DesignStudioTooltip>
          </div>
          <span className="text-[10px] font-mono text-gray-600 dark:text-white/50 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
            {Math.round(config.overlayOpacity * 100)}%
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.overlayOpacity}
            onChange={handleOverlayOpacityChange}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.5)]
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-cyan-400
              [&::-moz-range-thumb]:border-none
              [&::-moz-range-thumb]:cursor-pointer"
          />
          {/* Gradient track indicator */}
          <div
            className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-transparent to-gray-900/50 dark:to-white/50 pointer-events-none"
            style={{ width: `${config.overlayOpacity * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-400 dark:text-white/30">None</span>
          <span className="text-[9px] text-gray-400 dark:text-white/30">Dark</span>
        </div>
      </div>

      {/* Title Visibility Toggle (T010) */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Show title</h3>
            <DesignStudioTooltip content="Toggle whether the gallery title appears on the cover">
              <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
            </DesignStudioTooltip>
          </div>
          <button
            onClick={handleTitleVisibilityToggle}
            disabled={disabled}
            aria-pressed={config.titleVisible}
            aria-label={config.titleVisible ? 'Hide title' : 'Show title'}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${
              config.titleVisible
                ? 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                : 'bg-gray-300 dark:bg-white/20'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Toggle knob */}
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
                config.titleVisible ? 'translate-x-6' : 'translate-x-0'
              }`}
            >
              {config.titleVisible ? (
                <Eye className="w-3 h-3 text-cyan-500" />
              ) : (
                <EyeOff className="w-3 h-3 text-gray-400" />
              )}
            </div>
          </button>
        </div>
        <p className="text-[9px] text-gray-500 dark:text-white/40 mt-1">
          {config.titleVisible ? 'Gallery title will appear on the cover' : 'Cover will show image only'}
        </p>
      </div>
    </div>
  );
};

export default CoverPhotoSection;
