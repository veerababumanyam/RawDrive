/**
 * SpreadThumbnailStrip Component
 * Horizontal scrollable thumbnails for album navigation
 *
 * Features virtual scrolling for performance with large albums (>50 spreads)
 *
 * Feature: 026-album-proofing
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlbumSpreadPublic } from '../../../types/album';

// Constants for virtual scrolling
const THUMBNAIL_WIDTH = 96; // w-24 = 6rem = 96px
const THUMBNAIL_GAP = 8; // gap-2 = 0.5rem = 8px
const ITEM_SIZE = THUMBNAIL_WIDTH + THUMBNAIL_GAP;
const BUFFER_COUNT = 5; // Extra items to render on each side
const VIRTUAL_THRESHOLD = 50; // Enable virtual scrolling above this count

interface SpreadThumbnailStripProps {
  spreads: AlbumSpreadPublic[];
  currentIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}

/**
 * Individual thumbnail button component
 */
function ThumbnailButton({
  spread,
  index,
  isActive,
  onSelect,
  style,
  buttonRef,
}: {
  spread: AlbumSpreadPublic;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
  style?: React.CSSProperties;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  const { t } = useTranslation('album');

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(index)}
      className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${
        isActive
          ? 'border-primary-500 ring-2 ring-primary-500/30 scale-105'
          : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      style={style}
      aria-label={t('viewer.goToPage', { page: spread.page_number })}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* Thumbnail image */}
      <img
        src={spread.thumbnail_url}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Page number badge */}
      <span
        className={`absolute bottom-1 left-1 px-1.5 py-0.5 text-xs font-medium rounded ${
          isActive
            ? 'bg-primary-500 text-white'
            : 'bg-black/60 text-white'
        }`}
      >
        {spread.page_number}
      </span>

      {/* Comment indicator */}
      {spread.comments && spread.comments.length > 0 && (
        <span
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-amber-500 text-white text-xs font-bold rounded-full"
          aria-label={t('comments.count', { count: spread.comments.length })}
        >
          {spread.comments.length > 9 ? '9+' : spread.comments.length}
        </span>
      )}
    </button>
  );
}

export function SpreadThumbnailStrip({
  spreads,
  currentIndex,
  onSelect,
  className = '',
}: SpreadThumbnailStripProps) {
  const { t } = useTranslation('album');
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Virtual scrolling state
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Determine if we should use virtual scrolling
  const useVirtualScrolling = spreads.length > VIRTUAL_THRESHOLD;

  // Calculate visible range for virtual scrolling
  const visibleRange = useMemo(() => {
    if (!useVirtualScrolling) {
      return { start: 0, end: spreads.length };
    }

    const startIndex = Math.max(0, Math.floor(scrollLeft / ITEM_SIZE) - BUFFER_COUNT);
    const visibleCount = Math.ceil(containerWidth / ITEM_SIZE) + 2 * BUFFER_COUNT;
    const endIndex = Math.min(spreads.length, startIndex + visibleCount);

    return { start: startIndex, end: endIndex };
  }, [scrollLeft, containerWidth, spreads.length, useVirtualScrolling]);

  // Handle scroll events for virtual scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (useVirtualScrolling) {
      setScrollLeft(e.currentTarget.scrollLeft);
    }
  }, [useVirtualScrolling]);

  // Update container width on resize
  useEffect(() => {
    if (!useVirtualScrolling) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [useVirtualScrolling]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Check if active is outside visible area
      if (activeRect.left < containerRect.left) {
        container.scrollLeft -= containerRect.left - activeRect.left + 16;
      } else if (activeRect.right > containerRect.right) {
        container.scrollLeft += activeRect.right - containerRect.right + 16;
      }
    }
  }, [currentIndex]);

  if (spreads.length === 0) {
    return null;
  }

  // Total width for virtual scroll container
  const totalWidth = useVirtualScrolling ? spreads.length * ITEM_SIZE : undefined;

  // Get visible spreads
  const visibleSpreads = useVirtualScrolling
    ? spreads.slice(visibleRange.start, visibleRange.end)
    : spreads;

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 ${className}`}
      role="navigation"
      aria-label={t('viewer.thumbnailNavigation')}
    >
      <div
        ref={containerRef}
        className={`overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 ${
          useVirtualScrolling ? 'relative' : 'flex gap-2 p-3'
        }`}
        style={{ scrollBehavior: 'smooth' }}
        onScroll={handleScroll}
      >
        {useVirtualScrolling ? (
          // Virtual scrolling: absolute positioning
          <div
            className="relative h-[76px]"
            style={{ width: totalWidth, padding: '12px' }}
          >
            {visibleSpreads.map((spread, i) => {
              const actualIndex = visibleRange.start + i;
              const isActive = actualIndex === currentIndex;
              return (
                <ThumbnailButton
                  key={spread.spread_id}
                  spread={spread}
                  index={actualIndex}
                  isActive={isActive}
                  onSelect={onSelect}
                  buttonRef={isActive ? activeRef : undefined}
                  style={{
                    position: 'absolute',
                    left: actualIndex * ITEM_SIZE,
                    top: 12,
                  }}
                />
              );
            })}
          </div>
        ) : (
          // Standard rendering for small lists
          spreads.map((spread, index) => {
            const isActive = index === currentIndex;
            return (
              <ThumbnailButton
                key={spread.spread_id}
                spread={spread}
                index={index}
                isActive={isActive}
                onSelect={onSelect}
                buttonRef={isActive ? activeRef : undefined}
              />
            );
          })
        )}
      </div>

      {/* Navigation info */}
      <div className="flex items-center justify-center pb-2 text-sm text-gray-500 dark:text-gray-400">
        <span>
          {currentIndex + 1} / {spreads.length} {t('viewer.spreads')}
        </span>
      </div>
    </div>
  );
}

export default SpreadThumbnailStrip;
