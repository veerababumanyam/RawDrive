/**
 * AlbumProofViewer Component
 * Main container for album proofing experience
 *
 * Composes SpreadViewer, SpreadThumbnailStrip, and FlipbookViewer
 * with view mode toggle and fullscreen support.
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Maximize,
  Minimize,
  BookOpen,
  Grid,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SpreadViewer } from './SpreadViewer';
import { SpreadThumbnailStrip } from './SpreadThumbnailStrip';
import { FlipbookViewer } from './FlipbookViewer';
import type { AlbumProofResponse, AlbumSpreadPublic } from '../../../types/album';

/**
 * SkipLink - Visually hidden link that becomes visible on focus
 * Allows keyboard users to skip to main content areas
 */
function SkipLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    >
      {children}
    </a>
  );
}

type ViewMode = 'spread' | 'flipbook';

interface AlbumProofViewerProps {
  proof: AlbumProofResponse;
  initialSpreadIndex?: number;
  onSpreadChange?: (index: number) => void;
  onPinClick?: (spreadId: string, x: number, y: number) => void;
  onPinSelect?: (commentId: string) => void;
  commentPins?: Array<{
    spread_id: string;
    comment_id: string;
    x: number;
    y: number;
    isActive?: boolean;
  }>;
  showComments?: boolean;
  onToggleComments?: () => void;
  className?: string;
  children?: React.ReactNode; // For sidebar content
}

export function AlbumProofViewer({
  proof,
  initialSpreadIndex = 0,
  onSpreadChange,
  onPinClick,
  onPinSelect,
  commentPins = [],
  showComments = true,
  onToggleComments,
  className = '',
  children,
}: AlbumProofViewerProps) {
  const { t } = useTranslation('album');
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentIndex, setCurrentIndex] = useState(initialSpreadIndex);
  const [viewMode, setViewMode] = useState<ViewMode>('spread');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const spreads = proof.spreads;
  const currentSpread = spreads[currentIndex];

  // Preload adjacent spread images for smooth navigation
  useEffect(() => {
    const preloadImage = (url: string) => {
      const img = new Image();
      img.src = url;
    };

    // Preload next 2 and previous 1 spreads
    const preloadIndices = [
      currentIndex - 1,
      currentIndex + 1,
      currentIndex + 2,
    ].filter((i) => i >= 0 && i < spreads.length && i !== currentIndex);

    preloadIndices.forEach((index) => {
      const spread = spreads[index];
      if (spread?.image_url) {
        preloadImage(spread.image_url);
      }
    });
  }, [currentIndex, spreads]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          if (currentIndex < spreads.length - 1) {
            handleNavigate(currentIndex + 1);
          }
          break;
        case 'ArrowLeft':
        case 'PageUp':
          if (currentIndex > 0) {
            handleNavigate(currentIndex - 1);
          }
          break;
        case 'Home':
          handleNavigate(0);
          break;
        case 'End':
          handleNavigate(spreads.length - 1);
          break;
        case 'Escape':
          if (isFullscreen) {
            exitFullscreen();
          }
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            toggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, spreads.length, isFullscreen]);

  // Sync with external index changes
  useEffect(() => {
    setCurrentIndex(initialSpreadIndex);
  }, [initialSpreadIndex]);

  const handleNavigate = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      onSpreadChange?.(index);
    },
    [onSpreadChange]
  );

  const handlePinClick = useCallback(
    (x: number, y: number) => {
      if (currentSpread) {
        onPinClick?.(currentSpread.spread_id, x, y);
      }
    },
    [currentSpread, onPinClick]
  );

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Get pins for current spread
  const currentPins = commentPins
    .filter((pin) => pin.spread_id === currentSpread?.spread_id)
    .map((pin) => ({
      id: pin.comment_id,
      x: pin.x,
      y: pin.y,
      isActive: pin.isActive,
    }));

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}
      role="application"
      aria-label={t('viewer.albumProofViewer')}
    >
      {/* Skip links for accessibility */}
      <nav aria-label={t('viewer.skipLinks')} className="relative">
        <SkipLink href="#album-viewer">{t('viewer.skipToViewer')}</SkipLink>
        <SkipLink href="#album-thumbnails">{t('viewer.skipToThumbnails')}</SkipLink>
        {children && showComments && (
          <SkipLink href="#album-comments">{t('viewer.skipToComments')}</SkipLink>
        )}
      </nav>

      {/* ARIA live region for announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="album-announcer"
      >
        {t('viewer.currentSpread', { current: currentIndex + 1, total: spreads.length })}
      </div>

      {/* Header toolbar */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        role="banner"
      >
        {/* Branding */}
        <div className="flex items-center gap-3">
          {proof.branding.logo_url ? (
            <img
              src={proof.branding.logo_url}
              alt={proof.branding.photographer_name}
              className="h-8 w-auto"
            />
          ) : (
            <span
              className="text-lg font-semibold"
              style={{ color: proof.branding.primary_color }}
            >
              {proof.branding.photographer_name}
            </span>
          )}
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
          <h1 className="text-lg font-medium text-gray-900 dark:text-white truncate max-w-xs">
            {proof.title}
          </h1>
        </div>

        {/* View controls */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('spread')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'spread'
                  ? 'bg-white dark:bg-gray-600 shadow-sm'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label={t('viewer.spreadView')}
              aria-pressed={viewMode === 'spread'}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flipbook')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'flipbook'
                  ? 'bg-white dark:bg-gray-600 shadow-sm'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label={t('viewer.flipbookView')}
              aria-pressed={viewMode === 'flipbook'}
            >
              <BookOpen className="w-5 h-5" />
            </button>
          </div>

          {/* Comments toggle */}
          {onToggleComments && proof.permissions.can_comment && (
            <button
              type="button"
              onClick={onToggleComments}
              className={`p-2 rounded-lg transition-colors ${
                showComments
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label={t('comments.toggle')}
              aria-pressed={showComments}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label={isFullscreen ? t('viewer.exitFullscreen') : t('viewer.fullscreen')}
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex overflow-hidden" role="main">
        {/* Viewer */}
        <div id="album-viewer" className="flex-1 flex flex-col min-w-0" tabIndex={-1}>
          {/* Navigation arrows for spread view */}
          {viewMode === 'spread' && (
            <div className="relative flex-1 flex">
              {/* Previous button */}
              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={() => handleNavigate(currentIndex - 1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
                  aria-label={t('viewer.previous')}
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Spread viewer */}
              {currentSpread && (
                <SpreadViewer
                  spread={currentSpread}
                  onPinClick={proof.permissions.can_comment ? handlePinClick : undefined}
                  showCommentPins={showComments}
                  commentPins={currentPins}
                  onPinSelect={onPinSelect}
                  className="flex-1 p-4"
                />
              )}

              {/* Next button */}
              {currentIndex < spreads.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleNavigate(currentIndex + 1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
                  aria-label={t('viewer.next')}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>
          )}

          {/* Flipbook viewer */}
          {viewMode === 'flipbook' && (
            <FlipbookViewer
              spreads={spreads}
              currentIndex={currentIndex}
              onNavigate={handleNavigate}
              className="flex-1"
            />
          )}

          {/* Thumbnail strip */}
          <div id="album-thumbnails" tabIndex={-1}>
            <SpreadThumbnailStrip
              spreads={spreads}
              currentIndex={currentIndex}
              onSelect={handleNavigate}
            />
          </div>
        </div>

        {/* Sidebar for comments (children slot) */}
        {children && showComments && (
          <aside
            id="album-comments"
            className="w-80 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto"
            aria-label={t('comments.sidebar')}
            tabIndex={-1}
          >
            {children}
          </aside>
        )}
      </main>

      {/* Keyboard shortcuts help */}
      <div className="hidden md:flex items-center justify-center gap-6 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded ml-1">→</kbd>
          {' '}{t('viewer.arrowKeys')}
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">F</kbd>
          {' '}{t('viewer.fullscreenKey')}
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd>
          {' '}{t('viewer.escapeKey')}
        </span>
      </div>
    </div>
  );
}

export default AlbumProofViewer;
