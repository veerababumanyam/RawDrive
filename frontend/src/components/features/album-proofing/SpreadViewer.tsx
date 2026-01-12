/**
 * SpreadViewer Component
 * Displays an album spread with zoom and pan controls
 *
 * Feature: 026-album-proofing
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import type { AlbumSpreadPublic } from '../../../types/album';

interface SpreadViewerProps {
  spread: AlbumSpreadPublic;
  onPinClick?: (x: number, y: number) => void;
  showCommentPins?: boolean;
  commentPins?: Array<{
    id: string;
    x: number;
    y: number;
    isActive?: boolean;
  }>;
  onPinSelect?: (pinId: string) => void;
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

export function SpreadViewer({
  spread,
  onPinClick,
  showCommentPins = true,
  commentPins = [],
  onPinSelect,
  className = '',
}: SpreadViewerProps) {
  const { t } = useTranslation('album');
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset zoom and pan when spread changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setImageLoaded(false);
  }, [spread.spread_id]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - ZOOM_STEP, MIN_ZOOM);
      if (newZoom === 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse drag for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && zoom > 1) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, zoom, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch events for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && zoom > 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
      }
    },
    [zoom, pan]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isDragging && e.touches.length === 1 && zoom > 1) {
        const touch = e.touches[0];
        setPan({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y,
        });
      }
    },
    [isDragging, zoom, dragStart]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle click on spread for comment placement
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!onPinClick || isDragging || zoom > 1) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      onPinClick(x, y);
    },
    [onPinClick, isDragging, zoom]
  );

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom((prev) => Math.min(prev + 0.1, MAX_ZOOM));
      } else {
        setZoom((prev) => {
          const newZoom = Math.max(prev - 0.1, MIN_ZOOM);
          if (newZoom === 1) {
            setPan({ x: 0, y: 0 });
          }
          return newZoom;
        });
      }
    }
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleReset();
          break;
        case 'ArrowLeft':
          if (zoom > 1) {
            e.preventDefault();
            setPan((prev) => ({ ...prev, x: prev.x + 50 }));
          }
          break;
        case 'ArrowRight':
          if (zoom > 1) {
            e.preventDefault();
            setPan((prev) => ({ ...prev, x: prev.x - 50 }));
          }
          break;
        case 'ArrowUp':
          if (zoom > 1) {
            e.preventDefault();
            setPan((prev) => ({ ...prev, y: prev.y + 50 }));
          }
          break;
        case 'ArrowDown':
          if (zoom > 1) {
            e.preventDefault();
            setPan((prev) => ({ ...prev, y: prev.y - 50 }));
          }
          break;
      }
    },
    [zoom, handleZoomIn, handleZoomOut, handleReset]
  );

  return (
    <div
      className={`relative flex flex-col ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label={t('viewer.spreadViewer')}
    >
      {/* ARIA live region for zoom changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {t('viewer.zoomLevel', { level: Math.round(zoom * 100) })}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-md px-3 py-2">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t('viewer.zoomOut')}
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="min-w-[4rem] text-center text-sm font-medium">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t('viewer.zoomIn')}
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          type="button"
          onClick={handleReset}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t('viewer.reset')}
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Page number indicator */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-md px-3 py-1.5">
        <span className="text-sm font-medium">
          {t('viewer.page')} {spread.page_number}
        </span>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 rounded-lg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Loading skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full h-full max-w-4xl">
              {/* Album spread skeleton with pages */}
              <div className="animate-pulse w-full h-full bg-gray-200 dark:bg-gray-700 rounded-lg shadow-lg flex">
                {/* Left page */}
                <div className="flex-1 p-4 border-r border-gray-300 dark:border-gray-600">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-3" />
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2 mb-6" />
                  <div className="h-32 bg-gray-300 dark:bg-gray-600 rounded mb-4" />
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-5/6" />
                </div>
                {/* Right page */}
                <div className="flex-1 p-4">
                  <div className="h-48 bg-gray-300 dark:bg-gray-600 rounded mb-4" />
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-4/5 mb-2" />
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
                </div>
              </div>
              {/* Loading text */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('viewer.loading')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Spread image */}
        <img
          ref={imageRef}
          src={spread.image_url}
          alt={t('viewer.spreadAlt', { page: spread.page_number })}
          className="w-full h-full object-contain transition-transform duration-150 ease-out"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            opacity: imageLoaded ? 1 : 0,
          }}
          onClick={handleImageClick}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {/* Comment pins overlay */}
        {showCommentPins && imageLoaded && zoom === 1 && (
          <div className="absolute inset-0 pointer-events-none">
            {commentPins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                className={`absolute w-6 h-6 -ml-3 -mt-3 pointer-events-auto rounded-full border-2 flex items-center justify-center transition-all ${
                  pin.isActive
                    ? 'bg-primary-500 border-primary-600 scale-125'
                    : 'bg-amber-500 border-amber-600 hover:scale-110'
                }`}
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinSelect?.(pin.id);
                }}
                aria-label={t('comments.pinLabel', { id: pin.id })}
              >
                <span className="text-white text-xs font-bold">!</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SpreadViewer;
