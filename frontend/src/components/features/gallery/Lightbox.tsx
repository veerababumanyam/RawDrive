/**
 * Lightbox Component
 * Full-screen photo viewer with navigation, zoom, and keyboard shortcuts
 * Property 17: Lightbox Keyboard Navigation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Heart, CheckSquare, Info, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import { AppButton } from '../../ui/AppButton';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface LightboxProps {
  /** Whether the lightbox is open */
  isOpen: boolean;
  /** Callback when lightbox should close */
  onClose: () => void;
  /** Current asset being viewed */
  currentAsset: GalleryAssetItem | null;
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Current asset index */
  currentIndex: number;
  /** Callback when navigating to a different asset */
  onNavigate: (index: number) => void;
  /** Callback when favorite is toggled */
  onFavorite?: (assetId: string, favorite: boolean) => void;
  /** Callback when selection is toggled */
  onSelect?: (assetId: string) => void;
  /** Callback when download is requested */
  onDownload?: (assetId: string) => void;
  /** Callback when delete is requested */
  onDelete?: (assetId: string) => void;
  /** Whether EXIF data should be visible */
  exifVisible?: boolean;
  /** Gallery download policy */
  downloadPolicy?: 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';
}

export const Lightbox: React.FC<LightboxProps> = ({
  isOpen,
  onClose,
  currentAsset,
  assets,
  currentIndex,
  onNavigate,
  onFavorite,
  onSelect,
  onDownload,
  onDelete,
  exifVisible = false,
  downloadPolicy = 'view_only',
}) => {
  const { workspace } = useAuth();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showMetadata, setShowMetadata] = useState(false);
  const [rotation, setRotation] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Image loading fallback logic
  const [activeVariant, setActiveVariant] = useState<'preview' | 'original' | 'thumbnail'>('preview');

  // Reset variant when asset changes
  useEffect(() => {
    setActiveVariant('preview');
  }, [currentAsset?.asset_id]);

  // Fetch signed URL for preview image
  const {
    url: previewUrl,
    loading: urlLoading,
    error: urlError,
    refresh: refreshUrl,
  } = useSignedUrl({
    assetId: currentAsset?.asset_id || '',
    variant: activeVariant,
    enabled: isOpen && !!currentAsset?.asset_id && !!workspace?.workspace_id,
  });

  // Handle load errors by trying fallbacks
  useEffect(() => {
    if (urlError) {
      if (activeVariant === 'preview') {
        // If preview fails, try original if it's a web-safe image, otherwise straight to thumbnail
        const isWebSafe = currentAsset?.asset.mime_type?.match(/image\/(jpeg|png|webp|gif)/);
        if (isWebSafe) {
          setActiveVariant('original');
        } else {
          setActiveVariant('thumbnail');
        }
      } else if (activeVariant === 'original') {
        setActiveVariant('thumbnail');
      }
    }
  }, [urlError, activeVariant, currentAsset]);

  // Reset zoom and pan when asset changes
  useEffect(() => {
    if (isOpen && currentAsset) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
    }
  }, [isOpen, currentAsset?.asset_id]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default browser behavior for these keys
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', '+', '-', '0'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            onNavigate(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < assets.length - 1) {
            onNavigate(currentIndex + 1);
          }
          break;
        case 'Home':
          if (assets.length > 0) {
            onNavigate(0);
          }
          break;
        case 'End':
          if (assets.length > 0) {
            onNavigate(assets.length - 1);
          }
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          resetZoom();
          break;
        case 'm':
        case 'M':
          setShowMetadata((prev) => !prev);
          break;
        case 'r':
        case 'R':
          setRotation((prev) => (prev + 90) % 360);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, assets.length, onClose, onNavigate]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(5, prev + delta)));
    }
  }, []);

  // Pan handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [isPanning, zoom, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch gestures for mobile
  const touchStartRef = useRef<{ x: number; y: number; distance: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      touchStartRef.current = { x: (touch1.clientX + touch2.clientX) / 2, y: (touch1.clientY + touch2.clientY) / 2, distance };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const scale = distance / touchStartRef.current.distance;
      setZoom((prev) => Math.max(0.5, Math.min(5, prev * scale)));
      touchStartRef.current.distance = distance;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(5, prev + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(0.5, prev - 0.25);
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Navigation
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < assets.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, assets.length, onNavigate]);

  // Format date
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (!isOpen || !currentAsset) return null;

  const canDownload = downloadPolicy !== 'view_only';
  const isFavorite = currentAsset.is_favorited || false;
  const isSelected = currentAsset.is_selected || false;

  const lightbox = (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      aria-describedby="lightbox-description"
    >
      {/* Close Button */}
      <AppButton
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white border-white/20"
        aria-label="Close lightbox"
      >
        <X size={24} />
      </AppButton>

      {/* Navigation Arrows */}
      {currentIndex > 0 && (
        <button
          onClick={handlePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Previous photo"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {currentIndex < assets.length - 1 && (
        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Next photo"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Image Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {urlLoading ? (
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p>Loading image...</p>
          </div>
        ) : urlError || !previewUrl ? (
          <div className="flex flex-col items-center gap-4 text-white">
            <p>Failed to load image</p>
            <AppButton variant="outline" onClick={refreshUrl} className="text-white border-white/20">
              Retry
            </AppButton>
          </div>
        ) : (
          <img
            ref={imageRef}
            src={previewUrl}
            alt={currentAsset.asset.filename || `Photo ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotation}deg)`,
              transition: isPanning ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
            id="lightbox-image"
          />
        )}
      </div>

      {/* Controls Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Left: Asset Info */}
          <div className="flex items-center gap-4 text-white text-sm">
            <span id="lightbox-title" className="font-medium">
              {currentAsset.asset.filename || `Photo ${currentIndex + 1}`}
            </span>
            <span className="text-white/60">
              {currentIndex + 1} / {assets.length}
            </span>
            {currentAsset.asset.width && currentAsset.asset.height && (
              <span className="text-white/60">
                {currentAsset.asset.width} × {currentAsset.asset.height}
              </span>
            )}
          </div>

          {/* Center: Zoom Controls */}
          <div className="flex items-center gap-2">
            <AppButton
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="text-white hover:bg-white/20 border-white/20"
              aria-label="Zoom out"
            >
              <ZoomOut size={20} />
            </AppButton>
            <span className="text-white text-sm min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
            <AppButton
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
              className="text-white hover:bg-white/20 border-white/20"
              aria-label="Zoom in"
            >
              <ZoomIn size={20} />
            </AppButton>
            {zoom !== 1 && (
              <AppButton
                variant="ghost"
                size="icon"
                onClick={resetZoom}
                className="text-white hover:bg-white/20 border-white/20 ml-2"
                aria-label="Reset zoom"
              >
                Reset
              </AppButton>
            )}
            <AppButton
              variant="ghost"
              size="icon"
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className="text-white hover:bg-white/20 border-white/20"
              aria-label="Rotate"
            >
              <RotateCw size={20} />
            </AppButton>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {onFavorite && (
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => onFavorite(currentAsset.asset_id, !isFavorite)}
                className={`${isFavorite ? 'text-red-500' : 'text-white'} hover:bg-white/20 border-white/20`}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
              </AppButton>
            )}
            {onSelect && (
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => {
                  // Toggle selection - onSelect expects assetId, parent handles toggle logic
                  onSelect(currentAsset.asset_id);
                }}
                className={`${isSelected ? 'text-primary' : 'text-white'} hover:bg-white/20 border-white/20`}
                aria-label={isSelected ? 'Deselect' : 'Select'}
              >
                <CheckSquare size={20} fill={isSelected ? 'currentColor' : 'none'} />
              </AppButton>
            )}
            <AppButton
              variant="ghost"
              size="icon"
              onClick={() => setShowMetadata((prev) => !prev)}
              className={`${showMetadata ? 'bg-white/20' : ''} text-white hover:bg-white/20 border-white/20`}
              aria-label="Toggle metadata"
            >
              <Info size={20} />
            </AppButton>
            {canDownload && onDownload && (
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => onDownload(currentAsset.asset_id)}
                className="text-white hover:bg-white/20 border-white/20"
                aria-label="Download"
              >
                <Download size={20} />
              </AppButton>
            )}
            {onDelete && (
              <AppButton
                variant="ghost"
                size="icon"
                onClick={() => {
                  onClose();
                  onDelete(currentAsset.asset_id);
                }}
                className="text-white hover:bg-red-500/20 hover:text-red-400 border-white/20"
                aria-label="Delete"
              >
                <Trash2 size={20} />
              </AppButton>
            )}
          </div>
        </div>
      </div>

      {/* Metadata Panel */}
      {showMetadata && (
        <div className="absolute top-16 right-4 w-80 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg p-4 text-white text-sm max-h-[calc(100vh-200px)] overflow-y-auto">
          <h3 className="font-semibold mb-3">Photo Information</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-white/60">Filename</dt>
              <dd className="font-mono text-xs break-all">{currentAsset.asset.filename || 'Unknown'}</dd>
            </div>
            {currentAsset.asset.width && currentAsset.asset.height && (
              <div>
                <dt className="text-white/60">Dimensions</dt>
                <dd>
                  {currentAsset.asset.width} × {currentAsset.asset.height} pixels
                </dd>
              </div>
            )}
            {currentAsset.asset.file_size && (
              <div>
                <dt className="text-white/60">File Size</dt>
                <dd>{formatFileSize(currentAsset.asset.file_size)}</dd>
              </div>
            )}
            {currentAsset.asset.mime_type && (
              <div>
                <dt className="text-white/60">Type</dt>
                <dd>{currentAsset.asset.mime_type}</dd>
              </div>
            )}
            {currentAsset.asset.created_at && (
              <div>
                <dt className="text-white/60">Uploaded</dt>
                <dd>{formatDate(currentAsset.asset.created_at)}</dd>
              </div>
            )}
            {exifVisible && currentAsset.asset.exif && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <h4 className="font-semibold mb-2">EXIF Data</h4>
                <dl className="space-y-1 text-xs">
                  {Object.entries(currentAsset.asset.exif).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-white/60 capitalize">{key.replace(/_/g, ' ')}</dt>
                      <dd className="font-mono">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );

  return createPortal(lightbox, document.body);
};

