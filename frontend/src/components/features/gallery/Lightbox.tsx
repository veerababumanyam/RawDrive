/**
 * Lightbox Component
 * Full-screen photo viewer with navigation, zoom, and keyboard shortcuts
 * Property 17: Lightbox Keyboard Navigation
 *
 * Enhanced with:
 * - LQIP blur-up loading effect
 * - Image preloading for faster navigation
 * - Virtualized filmstrip navigation
 * - Extracted hooks for reusability
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Heart, CheckSquare, Info, Trash2, Image, Film, Play, Pause, Columns } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useAuth } from '../../../contexts/AuthContext';
import { AppButton } from '../../ui/AppButton';
import type { GalleryAssetItem } from '../../../types/gallery';
import { TagInput } from './TagInput';
import { CommentSection } from './CommentSection';
import { FaceOverlay } from './FaceOverlay';
import { LightboxImage, type LightboxImageRef } from './LightboxImage';
import { LightboxFilmstrip } from './LightboxFilmstrip';
import { LightboxSlideshow } from './LightboxSlideshow';
import { LightboxCompare } from './LightboxCompare';
import { useLightboxZoom } from '../../../hooks/lightbox/useLightboxZoom';
import { useLightboxNavigation } from '../../../hooks/lightbox/useLightboxNavigation';
import { useImagePreloader } from '../../../hooks/lightbox/useImagePreloader';
import { useLightboxSlideshow, type SlideshowSettings } from '../../../hooks/lightbox/useLightboxSlideshow';
import { peopleService, type FaceDetection, type Person } from '../../../services/metadataService';
import { Users, Sparkles } from 'lucide-react';
import { faceDetectionService } from '../../../services/faceDetectionService';


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
  /** Callback to set current asset as gallery cover */
  onSetCover?: (assetId: string) => void;
  /** Whether EXIF data should be visible */
  exifVisible?: boolean;
  /** Gallery download policy */
  downloadPolicy?: 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';
  /** Access Settings (download permissions etc) */
  settings?: {
    allowOriginalDownload?: boolean;
    exifVisible?: boolean;
  };
  /** ID of the gallery the assets belong to */
  galleryId: string;
  /** Whether to show the filmstrip (default: true) */
  showFilmstrip?: boolean;
  /** Whether to enable LQIP blur-up effect (default: true) */
  enableLqip?: boolean;
  /** Whether to preload adjacent images (default: true) */
  enablePreloading?: boolean;
  /** Initial slideshow settings */
  slideshowSettings?: Partial<SlideshowSettings>;
  /** Callback when slideshow completes (non-looping) */
  onSlideshowComplete?: () => void;
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
  onSetCover,
  exifVisible = false,
  downloadPolicy = 'view_only',
  galleryId,
  showFilmstrip: initialShowFilmstrip = true,
  enableLqip = true,
  enablePreloading = true,
  slideshowSettings: initialSlideshowSettings,
  onSlideshowComplete,
}) => {
  const { workspace } = useAuth();

  // Slideshow mode state
  const [isSlideshowMode, setIsSlideshowMode] = useState(false);

  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  // UI state
  const [showMetadata, setShowMetadata] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(initialShowFilmstrip);
  const [activeTab, setActiveTab] = useState<'info' | 'tags' | 'comments' | 'people'>('info');
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  // Refs
  const lightboxImageRef = useRef<LightboxImageRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Legacy ref for backward compatibility with face detection
  const imageRef = useRef<HTMLImageElement>(null);

  // Update imageRef when lightboxImageRef changes
  useEffect(() => {
    if (lightboxImageRef.current?.imageElement) {
      (imageRef as React.MutableRefObject<HTMLImageElement | null>).current = lightboxImageRef.current.imageElement;
    }
  }, [lightboxImageRef.current?.imageElement]);

  // Use extracted zoom hook
  const {
    zoom,
    pan,
    rotation,
    isPanning,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetZoom,
    rotate,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    reset: resetZoomState,
  } = useLightboxZoom();

  // Use extracted navigation hook
  const {
    goToPrevious: handlePrevious,
    goToNext: handleNext,
    goToIndex,
    canGoPrevious,
    canGoNext,
    positionLabel,
  } = useLightboxNavigation({
    currentIndex,
    totalAssets: assets.length,
    isOpen,
    onNavigate,
    onClose,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetZoom: resetZoom,
    onToggleMetadata: () => setShowMetadata((prev) => !prev),
    onRotate: () => rotate(90),
  });

  // Image preloader for faster navigation
  useImagePreloader({
    assets,
    currentIndex,
    enabled: enablePreloading && isOpen,
    preloadCount: 2,
  });

  // Slideshow hook
  const slideshow = useLightboxSlideshow({
    enabled: isSlideshowMode && isOpen,
    currentIndex,
    totalAssets: assets.length,
    onNavigate,
    settings: initialSlideshowSettings,
    onComplete: () => {
      setIsSlideshowMode(false);
      onSlideshowComplete?.();
    },
  });

  // Handle slideshow mode toggle
  const toggleSlideshow = useCallback(() => {
    if (isSlideshowMode) {
      slideshow.stop();
      setIsSlideshowMode(false);
    } else {
      setIsSlideshowMode(true);
      slideshow.play();
    }
  }, [isSlideshowMode, slideshow]);

  // Exit slideshow mode when lightbox closes
  useEffect(() => {
    if (!isOpen && isSlideshowMode) {
      slideshow.stop();
      setIsSlideshowMode(false);
    }
  }, [isOpen, isSlideshowMode, slideshow]);

  // Keyboard shortcut for slideshow toggle (S key)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleSlideshow();
      }

      // Space bar to toggle play/pause when in slideshow mode
      if (isSlideshowMode && e.key === ' ') {
        e.preventDefault();
        slideshow.toggle();
      }

      // Escape to exit slideshow mode (but not close lightbox)
      if (isSlideshowMode && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        slideshow.stop();
        setIsSlideshowMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSlideshowMode, slideshow, toggleSlideshow]);

  // Compare mode toggle
  const toggleCompareMode = useCallback(() => {
    if (isCompareMode) {
      setIsCompareMode(false);
      setCompareIndex(null);
    } else {
      // When entering compare mode, set the secondary image to the next one
      const nextIndex = currentIndex < assets.length - 1 ? currentIndex + 1 : 0;
      setCompareIndex(nextIndex);
      setIsCompareMode(true);
      // Exit slideshow if active
      if (isSlideshowMode) {
        slideshow.stop();
        setIsSlideshowMode(false);
      }
    }
  }, [isCompareMode, currentIndex, assets.length, isSlideshowMode, slideshow]);

  // Keyboard shortcut for compare mode (C key)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleCompareMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleCompareMode]);

  // Exit compare mode when lightbox closes
  useEffect(() => {
    if (!isOpen && isCompareMode) {
      setIsCompareMode(false);
      setCompareIndex(null);
    }
  }, [isOpen, isCompareMode]);

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
      resetZoomState();
    }
  }, [isOpen, currentAsset?.asset_id, resetZoomState]);

  // Fetch faces when People tab is active
  useEffect(() => {
    if (isOpen && currentAsset && workspace?.workspace_id && activeTab === 'people') {
      const fetchFaces = async () => {
        try {
          const assetFaces = await peopleService.getAssetFaces(workspace.workspace_id, currentAsset.asset_id);
          setFaces(assetFaces);
        } catch (error) {
          console.error('Failed to fetch faces:', error);
        }
      };
      fetchFaces();
    }
  }, [isOpen, currentAsset?.asset_id, workspace?.workspace_id, activeTab]);

  // Face Tagging Handlers
  const handleTagFace = async (faceId: string, personId: string) => {
    if (!workspace?.workspace_id) return;
    try {
      await peopleService.tagFace(workspace.workspace_id, faceId, personId);
      // Refresh faces
      const updatedFaces = await peopleService.getAssetFaces(workspace.workspace_id, currentAsset!.asset_id);
      setFaces(updatedFaces);
    } catch (error) {
      console.error('Failed to tag face:', error);
    }
  };

  const handleUntagFace = async (faceId: string) => {
    if (!workspace?.workspace_id) return;
    try {
      await peopleService.untagFace(workspace.workspace_id, faceId);
      const updatedFaces = await peopleService.getAssetFaces(workspace.workspace_id, currentAsset!.asset_id);
      setFaces(updatedFaces);
    } catch (error) {
      console.error('Failed to untag face:', error);
    }
  };

  const handleDeleteFace = async (faceId: string) => {
    if (!workspace?.workspace_id) return;
    try {
      await peopleService.deleteFaceDetection(workspace.workspace_id, faceId);
      setFaces(prev => prev.filter(f => f.face_id !== faceId));
    } catch (error) {
      console.error('Failed to delete face:', error);
    }
  };

  const handleCreateFace = async (bbox: { x: number; y: number; width: number; height: number }) => {
    if (!workspace?.workspace_id || !currentAsset) return;
    try {
      // bbox is relative to the rendered image size if we are drawing on the overlay which matches image size.
      // But API might expect absolute pixels relative to ORIGINAL image.
      // We need to scale the bbox if the rendered image is scaled down.
      // Currently, FaceOverlay is put on top of the image.
      // The image is rendered with `maxWidth: 100%`, `height: auto` etc.
      // To get accurate coordinates, we must map screen pixels to original image pixels.

      const imgElement = imageRef.current;
      if (!imgElement) return;

      const renderedWidth = imgElement.clientWidth;
      const renderedHeight = imgElement.clientHeight;
      const naturalWidth = imgElement.naturalWidth;
      const naturalHeight = imgElement.naturalHeight;

      const scaleX = naturalWidth / renderedWidth;
      const scaleY = naturalHeight / renderedHeight;

      const absoluteBbox = {
        x: Math.round(bbox.x * scaleX),
        y: Math.round(bbox.y * scaleY),
        width: Math.round(bbox.width * scaleX),
        height: Math.round(bbox.height * scaleY),
      };

      await peopleService.createFaceDetection(workspace.workspace_id, {
        asset_id: currentAsset.asset_id,
        bbox: absoluteBbox,
      });

      const updatedFaces = await peopleService.getAssetFaces(workspace.workspace_id, currentAsset.asset_id);
      setFaces(updatedFaces);
    } catch (error) {
      console.error('Failed to create face:', error);
    }
  };

  const handleCreatePerson = async (name: string): Promise<Person> => {
    if (!workspace?.workspace_id) throw new Error('No workspace');
    return peopleService.createPerson(workspace.workspace_id, name);
  };

  const handleAutoDetect = async () => {
    if (!currentAsset || !imageRef.current || !workspace?.workspace_id) return;

    // Show some loading indicator if we had one, or toast
    // For now we'll rely on the UI button state or just do it

    try {
      // 1. Run detection
      // Note: We need to use the actual image element that has the source loaded
      const detections = await faceDetectionService.detectFaces(imageRef.current);

      // 2. Process results
      let addedCount = 0;
      for (const det of detections) {
        // Map back to natural dimensions if face-api ran on scaled image? 
        // face-api runs on the element provided. If it's an <img>, it usually respects the rendered size 
        // OR the natural size depending on how it's called. 
        // detectAllFaces(input) - if input is classification, it uses the tensor.
        // If input is HTMLImageElement, it might use natural size.
        // Let's assume natural size for accuracy.

        // Wait, face-api results are relative to the input image dimensions.
        // If we passed the <img> tag, are they scaled?
        // Usually face-api returns coordinates relative to natural size of image.

        // Let's assume natural coordinates for now.
        const bbox = {
          x: Math.round(det.box.x),
          y: Math.round(det.box.y),
          width: Math.round(det.box.width),
          height: Math.round(det.box.height)
        };

        // Create face in backend
        await peopleService.createFaceDetection(workspace.workspace_id, {
          asset_id: currentAsset.asset_id,
          bbox: bbox,
          confidence: det.score
        });
        addedCount++;
      }

      if (addedCount > 0) {
        // Refresh
        const updatedFaces = await peopleService.getAssetFaces(workspace.workspace_id, currentAsset.asset_id);
        setFaces(updatedFaces);
      }

    } catch (error) {
      console.error("Auto detection failed", error);
    }
  };


  // Note: Keyboard navigation, body scroll prevention, zoom/pan/touch handlers
  // are now handled by useLightboxZoom and useLightboxNavigation hooks

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
      className="fixed inset-0 z-[9999] bg-black/98 backdrop-blur-[80px] saturate-[180%]"
      style={{
        backdropFilter: 'blur(80px) saturate(180%)',
        WebkitBackdropFilter: 'blur(80px) saturate(180%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      aria-describedby="lightbox-description"
    >
      {/* Gradient scrims for guaranteed contrast on any photo */}
      <div className="lightbox-scrim-top" />
      <div className="lightbox-scrim-bottom" />

      {/* Close Button — centralized glass style */}
      <button
        onClick={onClose}
        className="lightbox-glass-btn btn-close absolute top-4 right-4 z-50"
        aria-label="Close lightbox"
      >
        <X size={24} />
      </button>

      {/* Navigation Arrows — centralized glass style */}
      {!isSlideshowMode && canGoPrevious && (
        <div className="lightbox-nav-arrow prev">
          <button
            onClick={handlePrevious}
            className="lightbox-glass-btn btn-lg"
            aria-label="Previous photo"
          >
            <ChevronLeft size={28} />
          </button>
        </div>
      )}

      {!isSlideshowMode && canGoNext && (
        <div className="lightbox-nav-arrow next">
          <button
            onClick={handleNext}
            className="lightbox-glass-btn btn-lg"
            aria-label="Next photo"
          >
            <ChevronRight size={28} />
          </button>
        </div>
      )}

      {/* Image Container - Hidden during slideshow (slideshow renders its own) */}
      {!isSlideshowMode && (
      <div
        ref={containerRef}
        className={`absolute inset-0 flex items-center justify-center p-4 overflow-hidden ${showFilmstrip ? 'pb-24' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {urlError && !previewUrl ? (
          <div className="flex flex-col items-center gap-4 text-white">
            <p>Failed to load image</p>
            <AppButton variant="outline" onClick={refreshUrl} className="text-white border-white/20">
              Retry
            </AppButton>
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotation}deg)`,
              transition: isPanning ? 'none' : 'transform 0.2s ease-out',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            {/* LightboxImage with LQIP blur-up effect */}
            <LightboxImage
              ref={lightboxImageRef}
              src={previewUrl || ''}
              lqip={enableLqip ? currentAsset.asset.lqip : undefined}
              alt={currentAsset.asset.filename || `Photo ${currentIndex + 1}`}
              isLoading={urlLoading}
              hasError={!!urlError}
              onError={refreshUrl}
              className="block select-none"
            />
            {activeTab === 'people' && (
              <FaceOverlay
                faces={faces.map(face => {
                  // Map absolute coordinates back to rendered coordinates
                  const img = imageRef.current;
                  if (!img) return face;

                  const scaleX = img.clientWidth / img.naturalWidth;
                  const scaleY = img.clientHeight / img.naturalHeight;

                  return {
                    ...face,
                    bbox: {
                      x: face.bbox.x * scaleX,
                      y: face.bbox.y * scaleY,
                      width: face.bbox.width * scaleX,
                      height: face.bbox.height * scaleY,
                    }
                  };
                })}
                onTagFace={handleTagFace}
                onCreateFace={handleCreateFace}
                onDeleteFace={handleDeleteFace}
                onUntagFace={handleUntagFace}
                onCreatePerson={handleCreatePerson}
                isDrawingMode={isDrawingMode}
                onDrawingComplete={() => setIsDrawingMode(false)}
              />
            )}
          </div>
        )}
      </div>
      )}

      {/* Slideshow Mode Overlay */}
      {isSlideshowMode && currentAsset && (
        <LightboxSlideshow
          assets={assets}
          currentIndex={currentIndex}
          onNavigate={onNavigate}
          onExit={() => {
            slideshow.stop();
            setIsSlideshowMode(false);
          }}
          getPreviewUrl={(assetId) => {
            // Find the asset and return its preview URL
            const asset = assets.find((a) => a.asset_id === assetId);
            return asset?.asset?.preview_url || asset?.asset?.thumbnail_url;
          }}
          settings={initialSlideshowSettings}
          prefersReducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
        />
      )}

      {/* Compare Mode Overlay */}
      {isCompareMode && currentAsset && compareIndex !== null && (
        <LightboxCompare
          assets={assets}
          primaryIndex={currentIndex}
          secondaryIndex={compareIndex}
          onPrimaryChange={onNavigate}
          onSecondaryChange={setCompareIndex}
          onExit={() => {
            setIsCompareMode(false);
            setCompareIndex(null);
          }}
          getPreviewUrl={(assetId) => {
            // Find the asset and return its preview URL
            const asset = assets.find((a) => a.asset_id === assetId);
            return asset?.asset?.preview_url || asset?.asset?.thumbnail_url;
          }}
        />
      )}

      {/* Filmstrip Navigation — inside auto-hide wrapper */}
      {showFilmstrip && !isSlideshowMode && !isCompareMode && (
        <div className="absolute bottom-16 left-0 right-0 z-40">
          <LightboxFilmstrip
            assets={assets}
            currentIndex={currentIndex}
            onSelect={goToIndex}
            visible={showFilmstrip}
          />
        </div>
      )}

      {/* Controls Bar — centralized glass buttons */}
      {!isSlideshowMode && !isCompareMode && (
      <div className="lightbox-bottom-bar">
        {/* Left: Asset Info */}
        <div className="lightbox-info-text hidden md:flex items-center gap-3">
          <span id="lightbox-title">{currentAsset.asset.filename || `Photo ${currentIndex + 1}`}</span>
          <span className="secondary">{positionLabel}</span>
          {currentAsset.asset.width && currentAsset.asset.height && (
            <span className="secondary">{currentAsset.asset.width} × {currentAsset.asset.height}</span>
          )}
        </div>

        {/* Center: Zoom + Mode Controls */}
        <div className="lightbox-btn-group">
          <button onClick={handleZoomOut} disabled={zoom <= 0.5} className="lightbox-glass-btn" aria-label="Zoom out"><ZoomOut size={20} /></button>
          <span className="text-white text-sm min-w-[50px] text-center select-none">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= 5} className="lightbox-glass-btn" aria-label="Zoom in"><ZoomIn size={20} /></button>
          {zoom !== 1 && (
            <button onClick={resetZoom} className="lightbox-glass-btn" aria-label="Reset zoom"><span className="text-white text-xs font-medium">1:1</span></button>
          )}
          <button onClick={() => rotate(90)} className="lightbox-glass-btn" aria-label="Rotate"><RotateCw size={20} /></button>
          <button onClick={() => setShowFilmstrip((prev) => !prev)} className={`lightbox-glass-btn ${showFilmstrip ? 'active' : ''}`} aria-label={showFilmstrip ? 'Hide filmstrip' : 'Show filmstrip'}><Film size={20} /></button>
          <button onClick={toggleSlideshow} className={`lightbox-glass-btn ${isSlideshowMode ? 'active' : ''}`} aria-label={isSlideshowMode ? 'Stop slideshow' : 'Start slideshow'}>{isSlideshowMode ? <Pause size={20} /> : <Play size={20} />}</button>
          <button onClick={toggleCompareMode} className={`lightbox-glass-btn ${isCompareMode ? 'active' : ''}`} aria-label={isCompareMode ? 'Exit compare mode' : 'Enter compare mode'} disabled={assets.length < 2}><Columns size={20} /></button>
        </div>

        {/* Right: Actions */}
        <div className="lightbox-btn-group">
          {onFavorite && (
            <button onClick={() => onFavorite(currentAsset.asset_id, !isFavorite)} className={`lightbox-glass-btn btn-favorite ${isFavorite ? 'active' : ''}`} aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={isFavorite}>
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {onSelect && (
            <button onClick={() => onSelect(currentAsset.asset_id)} className={`lightbox-glass-btn btn-select ${isSelected ? 'active' : ''}`} aria-label={isSelected ? 'Deselect' : 'Select'} aria-pressed={isSelected}>
              <CheckSquare size={20} fill={isSelected ? 'currentColor' : 'none'} />
            </button>
          )}
          <button onClick={() => setShowMetadata((prev) => !prev)} className={`lightbox-glass-btn ${showMetadata ? 'active' : ''}`} aria-label="Toggle metadata"><Info size={20} /></button>
          {onSetCover && (
            <button onClick={() => onSetCover(currentAsset.asset_id)} className="lightbox-glass-btn" aria-label="Set as Gallery Cover"><Image size={20} /></button>
          )}
          {canDownload && onDownload && (
            <button onClick={() => onDownload(currentAsset.asset_id)} className="lightbox-glass-btn" aria-label="Download"><Download size={20} /></button>
          )}
          {onDelete && (
            <button onClick={() => { onClose(); onDelete(currentAsset.asset_id); }} className="lightbox-glass-btn btn-delete" aria-label="Delete"><Trash2 size={20} /></button>
          )}
        </div>
      </div>
      )}

      {/* Metadata Panel */}
      {
        showMetadata && (
          <div className="absolute top-16 right-4 w-80 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg flex flex-col max-h-[calc(100vh-200px)] overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/20">
              <button
                onClick={() => setActiveTab('info')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'info'
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                Info
              </button>
              <button
                onClick={() => setActiveTab('tags')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'tags'
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                Tags
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'comments'
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                Comments
              </button>
              <button
                onClick={() => setActiveTab('people')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'people'
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                People
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <>
                  <h3 className="font-semibold mb-3 text-white text-sm">Photo Information</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-white/60">Filename</dt>
                      <dd className="font-mono text-xs break-all text-white">{currentAsset.asset.filename || 'Unknown'}</dd>
                    </div>
                    {currentAsset.asset.width && currentAsset.asset.height && (
                      <div>
                        <dt className="text-white/60">Dimensions</dt>
                        <dd className="text-white">
                          {currentAsset.asset.width} × {currentAsset.asset.height} pixels
                        </dd>
                      </div>
                    )}
                    {currentAsset.asset.file_size && (
                      <div>
                        <dt className="text-white/60">File Size</dt>
                        <dd className="text-white">{formatFileSize(currentAsset.asset.file_size)}</dd>
                      </div>
                    )}
                    {currentAsset.asset.mime_type && (
                      <div>
                        <dt className="text-white/60">Type</dt>
                        <dd className="text-white">{currentAsset.asset.mime_type}</dd>
                      </div>
                    )}
                    {currentAsset.asset.created_at && (
                      <div>
                        <dt className="text-white/60">Uploaded</dt>
                        <dd className="text-white">{formatDate(currentAsset.asset.created_at)}</dd>
                      </div>
                    )}
                    {exifVisible && currentAsset.asset.exif && (
                      <div className="mt-4 pt-4 border-t border-white/20">
                        <h4 className="font-semibold mb-2 text-white">EXIF Data</h4>
                        <dl className="space-y-1 text-xs">
                          {Object.entries(currentAsset.asset.exif).map(([key, value]) => (
                            <div key={key}>
                              <dt className="text-white/60 capitalize">{key.replace(/_/g, ' ')}</dt>
                              <dd className="font-mono text-white">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </dl>
                </>
              )}

              {activeTab === 'tags' && (
                <div className="text-white">
                  <TagInput assetId={currentAsset.asset_id} className="text-white" />
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="text-white">
                  <CommentSection
                    galleryId={galleryId}
                    assetId={currentAsset.asset_id}
                    className="text-white h-full"
                  />
                </div>
              )}

              {activeTab === 'people' && (
                <div className="text-white h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">People & Faces</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAutoDetect}
                        className="text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10 flex items-center gap-1"
                        title="Auto-detect faces"
                      >
                        <Sparkles size={12} />
                        <span>Auto</span>
                      </button>
                      <button
                        onClick={() => setIsDrawingMode(!isDrawingMode)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${isDrawingMode
                          ? 'bg-primary border-primary text-white'
                          : 'border-white/20 hover:bg-white/10'
                          }`}
                      >
                        {isDrawingMode ? 'Done' : 'Add'}
                      </button>
                    </div>
                  </div>

                  {faces.length === 0 ? (
                    <div className="text-white/60 text-sm text-center py-8">
                      <Users className="mx-auto mb-2 opacity-50" size={24} />
                      <p>No people detected</p>
                      <button
                        onClick={() => setIsDrawingMode(true)}
                        className="text-primary hover:underline mt-2"
                      >
                        Manually add a face
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto">
                      {faces.map(face => (
                        <div key={face.face_id} className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                            <Users size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {face.person_name || <span className="text-white/50 italic">Unknown</span>}
                            </div>
                            {face.confidence && (
                              <div className="text-xs text-white/40">
                                {Math.round(face.confidence * 100)}% confidence
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteFace(face.face_id)}
                            className="p-1 hover:bg-error/20 text-white/40 hover:text-error rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      }
    </div >
  );

  return createPortal(lightbox, document.body);
};

