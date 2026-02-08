/**
 * StoryTimeline Component
 * A chronological timeline layout that tells the story of an event through photos.
 *
 * Features:
 * - Chronological ordering with date/time separators
 * - Grouped sections by time periods (hour, day, event moment)
 * - Elegant date markers with smooth scrolling
 * - Horizontal and vertical layout options
 * - Ken Burns animations on hover
 * - Touch-friendly navigation
 * - Accessibility compliant
 *
 * @module layouts/StoryTimeline
 */

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, ChevronLeft, ChevronRight, Grid, List, Image } from 'lucide-react';
import type { GalleryAssetItem } from '../../../../types/gallery';
import { PhotoCard } from '../PhotoCard';
import { AppButton } from '../../../ui/AppButton';

// ============================================================================
// Types
// ============================================================================

export interface StoryTimelineProps {
  /** Assets to display */
  assets: GalleryAssetItem[];
  /** Selected asset IDs */
  selectedAssetIds?: Set<string>;
  /** Enable management selection mode */
  managementSelectable?: boolean;
  /** Show customer selection toggle */
  showCustomerSelection?: boolean;
  /** Cover asset ID */
  coverAssetId?: string | null;
  /** Callback when asset is clicked */
  onAssetClick?: (asset: GalleryAssetItem, index: number) => void;
  /** Callback when asset favorite is toggled */
  onAssetFavorite?: (assetId: string, favorite: boolean) => void;
  /** Callback for management selection */
  onManagementSelect?: (assetId: string) => void;
  /** Callback for customer selection toggle */
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  /** Whether layout is loading */
  isLoading?: boolean;
  /** Custom class name */
  className?: string;
  /** Grouping mode */
  groupBy?: 'hour' | 'day' | 'auto';
  /** Layout orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Show navigation */
  showNavigation?: boolean;
  /** Gallery title for story context */
  galleryTitle?: string;
  /** Event date for fallback */
  eventDate?: string;
}

interface TimelineGroup {
  key: string;
  label: string;
  sublabel?: string;
  timestamp: Date;
  assets: Array<GalleryAssetItem & { originalIndex: number }>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract capture date from asset
 */
function getCaptureDate(asset: GalleryAssetItem, fallbackDate?: string): Date | null {
  // Try EXIF date first (date_taken is the standardized field name)
  const exifDate = asset.asset?.exif?.date_taken;
  if (exifDate) {
    const parsed = new Date(exifDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try created_at
  if (asset.asset?.created_at) {
    const parsed = new Date(asset.asset.created_at);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback to event date
  if (fallbackDate) {
    const parsed = new Date(fallbackDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for display
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get hour key for grouping
 */
function getHourKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
}

/**
 * Get day key for grouping
 */
function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Timeline date marker
 */
const TimelineMarker: React.FC<{
  label: string;
  sublabel?: string;
  isFirst?: boolean;
  orientation: 'horizontal' | 'vertical';
}> = ({ label, sublabel, isFirst, orientation }) => (
  <div
    className={`
      flex items-center gap-3
      ${orientation === 'vertical' ? 'flex-row' : 'flex-col'}
    `}
  >
    {/* Marker dot */}
    <div className="relative">
      <div className={`
        w-3 h-3 rounded-full bg-primary-500
        ${isFirst ? 'ring-4 ring-primary-500/20' : ''}
      `} />
      {!isFirst && orientation === 'vertical' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0.5 h-8 bg-border" />
      )}
    </div>

    {/* Label */}
    <div className={`
      ${orientation === 'vertical' ? 'text-left' : 'text-center'}
    `}>
      <div className="flex items-center gap-2 text-text-primary font-medium">
        <Calendar className="w-4 h-4 text-primary-500" />
        <span className="text-sm">{label}</span>
      </div>
      {sublabel && (
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock className="w-3 h-3" />
          <span className="text-xs">{sublabel}</span>
        </div>
      )}
    </div>
  </div>
);

/**
 * Horizontal scroll navigation
 */
const HorizontalNav: React.FC<{
  onScrollLeft: () => void;
  onScrollRight: () => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}> = ({ onScrollLeft, onScrollRight, canScrollLeft, canScrollRight }) => (
  <>
    <AnimatePresence>
      {canScrollLeft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10"
        >
          <AppButton
            variant="glass"
            size="icon"
            onClick={onScrollLeft}
            className="shadow-lg"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </AppButton>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {canScrollRight && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10"
        >
          <AppButton
            variant="glass"
            size="icon"
            onClick={onScrollRight}
            className="shadow-lg"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </AppButton>
        </motion.div>
      )}
    </AnimatePresence>
  </>
);

// ============================================================================
// Main Component
// ============================================================================

export const StoryTimeline: React.FC<StoryTimelineProps> = ({
  assets,
  selectedAssetIds = new Set(),
  managementSelectable = false,
  showCustomerSelection = true,
  coverAssetId,
  onAssetClick,
  onAssetFavorite,
  onManagementSelect,
  onCustomerSelectionToggle,
  isLoading = false,
  className = '',
  groupBy = 'auto',
  orientation = 'vertical',
  showNavigation = true,
  galleryTitle,
  eventDate,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // Group assets by time
  const timelineGroups = useMemo<TimelineGroup[]>(() => {
    if (assets.length === 0) return [];

    // Add original index and parse dates
    const assetsWithDates = assets.map((asset, index) => ({
      ...asset,
      originalIndex: index,
      captureDate: getCaptureDate(asset, eventDate),
    }));

    // Sort by capture date
    const sorted = [...assetsWithDates].sort((a, b) => {
      if (!a.captureDate && !b.captureDate) return 0;
      if (!a.captureDate) return 1;
      if (!b.captureDate) return -1;
      return a.captureDate.getTime() - b.captureDate.getTime();
    });

    // Determine grouping mode
    let effectiveGroupBy = groupBy;
    if (groupBy === 'auto') {
      // Check time span
      const firstDate = sorted.find((a) => a.captureDate)?.captureDate;
      const lastDate = [...sorted].reverse().find((a) => a.captureDate)?.captureDate;

      if (firstDate && lastDate) {
        const hoursDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60);
        effectiveGroupBy = hoursDiff > 24 ? 'day' : 'hour';
      } else {
        effectiveGroupBy = 'day';
      }
    }

    // Group assets
    const groups = new Map<string, TimelineGroup>();

    sorted.forEach((asset) => {
      if (!asset.captureDate) {
        // Group undated photos together
        const key = 'undated';
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: 'Undated Photos',
            timestamp: new Date(),
            assets: [],
          });
        }
        groups.get(key)!.assets.push(asset);
        return;
      }

      const key =
        effectiveGroupBy === 'hour'
          ? getHourKey(asset.captureDate)
          : getDayKey(asset.captureDate);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatDate(asset.captureDate),
          sublabel: effectiveGroupBy === 'hour' ? formatTime(asset.captureDate) : undefined,
          timestamp: asset.captureDate,
          assets: [],
        });
      }

      groups.get(key)!.assets.push(asset);
    });

    // Convert to array and sort
    return Array.from(groups.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }, [assets, groupBy, eventDate]);

  // Update scroll state
  const updateScrollState = useCallback(() => {
    if (!scrollContainerRef.current || orientation === 'vertical') return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, [orientation]);

  // Scroll handlers
  const scrollLeft = useCallback(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
  }, []);

  const scrollRight = useCallback(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
  }, []);

  // Set up scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || orientation === 'vertical') return;

    updateScrollState();
    container.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, orientation]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-8 ${className}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <div className="h-6 w-48 bg-surface-secondary animate-pulse rounded" />
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div
                  key={j}
                  className="aspect-[4/3] bg-surface-secondary animate-pulse rounded-lg"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (assets.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <Image className="w-12 h-12 text-text-tertiary mb-4" />
        <p className="text-text-secondary">No photos to display</p>
      </div>
    );
  }

  // No timeline data
  if (timelineGroups.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <Calendar className="w-12 h-12 text-text-tertiary mb-4" />
        <p className="text-text-secondary">Unable to create timeline from photos</p>
        <p className="text-text-tertiary text-sm">Photos need date information for timeline view</p>
      </div>
    );
  }

  // Vertical layout
  if (orientation === 'vertical') {
    return (
      <div className={`relative ${className}`}>
        {/* Vertical timeline line */}
        <div className="absolute left-[5px] top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-12">
          {timelineGroups.map((group, groupIndex) => (
            <motion.section
              key={group.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
              className="relative"
            >
              {/* Timeline marker */}
              <div className="mb-4 pl-8">
                <TimelineMarker
                  label={group.label}
                  sublabel={group.sublabel}
                  isFirst={groupIndex === 0}
                  orientation="vertical"
                />
              </div>

              {/* Photos grid */}
              <div className="pl-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.assets.map((asset) => {
                  const isSelected = selectedAssetIds.has(asset.asset_id);
                  const isCover = coverAssetId === asset.asset_id;

                  return (
                    <motion.div
                      key={asset.asset_id}
                      whileHover={{ scale: 1.02 }}
                      className="overflow-hidden rounded-lg"
                    >
                      <PhotoCard
                        asset={asset}
                        index={asset.originalIndex}
                        isManagementSelected={isSelected}
                        isCover={isCover}
                        managementSelectable={managementSelectable}
                        showCustomerSelection={showCustomerSelection}
                        aspectRatio="auto"
                        onClick={onAssetClick ? (a, idx, _e) => onAssetClick(a, idx) : undefined}
                        onFavorite={onAssetFavorite ? (assetId, favorite) => onAssetFavorite(assetId, favorite) : undefined}
                        onManagementSelect={onManagementSelect ? (assetId) => onManagementSelect(assetId) : undefined}
                        onCustomerSelectionToggle={onCustomerSelectionToggle ? (assetId, selected) =>
                          onCustomerSelectionToggle(assetId, selected) : undefined
                        }
                      />
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          ))}
        </div>
      </div>
    );
  }

  // Horizontal layout
  return (
    <div className={`relative ${className}`}>
      {/* Header with title */}
      {galleryTitle && (
        <h2 className="text-xl font-semibold text-text-primary mb-6">{galleryTitle}</h2>
      )}

      {/* Navigation buttons */}
      {showNavigation && (
        <HorizontalNav
          onScrollLeft={scrollLeft}
          onScrollRight={scrollRight}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
        />
      )}

      {/* Horizontal timeline */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto scrollbar-hide pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-8 min-w-max px-4">
          {timelineGroups.map((group, groupIndex) => (
            <motion.section
              key={group.key}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
              className="flex-shrink-0"
            >
              {/* Timeline marker */}
              <div className="mb-4 text-center">
                <TimelineMarker
                  label={group.label}
                  sublabel={group.sublabel}
                  isFirst={groupIndex === 0}
                  orientation="horizontal"
                />
              </div>

              {/* Photos row */}
              <div className="flex gap-3">
                {group.assets.slice(0, 6).map((asset) => {
                  const isSelected = selectedAssetIds.has(asset.asset_id);
                  const isCover = coverAssetId === asset.asset_id;

                  return (
                    <motion.div
                      key={asset.asset_id}
                      whileHover={{ scale: 1.05 }}
                      className="w-40 h-28 overflow-hidden rounded-lg flex-shrink-0"
                    >
                      <PhotoCard
                        asset={asset}
                        index={asset.originalIndex}
                        isManagementSelected={isSelected}
                        isCover={isCover}
                        managementSelectable={managementSelectable}
                        showCustomerSelection={showCustomerSelection}
                        aspectRatio="auto"
                        onClick={onAssetClick ? (a, idx, _e) => onAssetClick(a, idx) : undefined}
                        onFavorite={onAssetFavorite ? (assetId, favorite) => onAssetFavorite(assetId, favorite) : undefined}
                        onManagementSelect={onManagementSelect ? (assetId) => onManagementSelect(assetId) : undefined}
                        onCustomerSelectionToggle={onCustomerSelectionToggle ? (assetId, selected) =>
                          onCustomerSelectionToggle(assetId, selected) : undefined
                        }
                      />
                    </motion.div>
                  );
                })}

                {/* Show more indicator */}
                {group.assets.length > 6 && (
                  <div className="w-40 h-28 flex-shrink-0 bg-surface-secondary rounded-lg flex items-center justify-center">
                    <span className="text-text-secondary font-medium">
                      +{group.assets.length - 6} more
                    </span>
                  </div>
                )}
              </div>
            </motion.section>
          ))}
        </div>
      </div>

      {/* Progress indicator */}
      {showNavigation && timelineGroups.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {timelineGroups.map((group, index) => (
            <button
              key={group.key}
              onClick={() => {
                const container = scrollContainerRef.current;
                if (!container) return;
                const groupWidth = container.scrollWidth / timelineGroups.length;
                container.scrollTo({ left: index * groupWidth, behavior: 'smooth' });
                setActiveGroupIndex(index);
              }}
              className={`
                w-2 h-2 rounded-full transition-all
                ${index === activeGroupIndex ? 'bg-primary-500 w-4' : 'bg-border hover:bg-text-tertiary'}
              `}
              aria-label={`Go to ${group.label}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default StoryTimeline;
