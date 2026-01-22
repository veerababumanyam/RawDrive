/**
 * Cover Style Grid Component
 *
 * Displays cover styles in a grid with:
 * - Category filtering (basic, text, advanced, premium)
 * - Lazy loading for performance
 * - Hover effects and selection states
 * - Premium badge indicators
 *
 * Feature: Gallery Design Studio - Cover Style Selection
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  COVER_STYLES,
  getCoverStylesByCategory,
  getCoverStyleStats,
} from '../../../../constants/coverStyleCatalog';

interface CoverStyleGridProps {
  selectedStyle: string;
  onSelectStyle: (styleId: string) => void;
  category?: 'all' | 'basic' | 'text' | 'advanced' | 'premium';
  onCategoryChange?: (category: 'all' | 'basic' | 'text' | 'advanced' | 'premium') => void;
  aiRecommendedStyles?: string[]; // Style IDs that are AI-recommended
}

export const CoverStyleGrid: React.FC<CoverStyleGridProps> = ({
  selectedStyle,
  onSelectStyle,
  category = 'all',
  onCategoryChange,
  aiRecommendedStyles = [],
}) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 12 });
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get filtered styles
  const filteredStyles = category === 'all' ? COVER_STYLES : getCoverStylesByCategory(category);
  const stats = getCoverStyleStats();

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleRange((prev) => ({
              ...prev,
              end: Math.min(prev.end + 6, filteredStyles.length),
            }));
          }
        });
      },
      { rootMargin: '200px' }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [filteredStyles.length]);

  const visibleStyles = filteredStyles.slice(visibleRange.start, visibleRange.end);

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all' as const, label: 'All', count: stats.total },
          { id: 'basic' as const, label: 'Basic', count: stats.byCategory.basic },
          { id: 'text' as const, label: 'Text', count: stats.byCategory.text },
          { id: 'advanced' as const, label: 'Advanced', count: stats.byCategory.advanced },
          { id: 'premium' as const, label: 'Premium', count: stats.byCategory.premium },
        ].map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => {
              setVisibleRange({ start: 0, end: 12 });
              onCategoryChange?.(id);
            }}
            className={`px-3 py-1.5 text-xs rounded-full transition-all ${
              category === id
                ? 'bg-accent-primary text-white shadow-md'
                : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-border-default'
            }`}
          >
            {label}
            <span className="ml-1 text-xs opacity-75">({count})</span>
          </button>
        ))}
      </div>

      {/* Styles Grid */}
      <div ref={containerRef} className="grid grid-cols-3 gap-2">
        {visibleStyles.map((style) => (
          <CoverStyleGridItem
            key={style.id}
            style={style}
            isSelected={selectedStyle === style.id}
            onSelect={() => onSelectStyle(style.id)}
            isAIRecommended={aiRecommendedStyles.includes(style.id)}
          />
        ))}
      </div>

      {/* Loading Sentinel */}
      {visibleRange.end < filteredStyles.length && (
        <div ref={sentinelRef} className="py-4 text-center">
          <p className="text-xs text-text-tertiary">
            Loading more styles ({visibleRange.end} of {filteredStyles.length})...
          </p>
        </div>
      )}

      {/* End of List */}
      {visibleRange.end >= filteredStyles.length && filteredStyles.length > 0 && (
        <div className="py-2 text-center">
          <p className="text-xs text-text-tertiary">
            Showing all {filteredStyles.length} styles
          </p>
        </div>
      )}

      {filteredStyles.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-text-secondary">No styles found in this category</p>
        </div>
      )}
    </div>
  );
};

/**
 * Individual Cover Style Grid Item
 */
interface CoverStyleGridItemProps {
  style: any;
  isSelected: boolean;
  onSelect: () => void;
  isAIRecommended?: boolean;
}

const CoverStyleGridItem: React.FC<CoverStyleGridItemProps> = ({
  style,
  isSelected,
  onSelect,
  isAIRecommended,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`group p-2 rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-accent-primary bg-accent-primary/5 shadow-md'
          : 'border-border-default hover:border-accent-primary hover:shadow-md'
      }`}
      title={style.description}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square mb-2 rounded overflow-hidden bg-gradient-to-br from-bg-secondary via-bg-primary to-bg-tertiary">
        {/* Placeholder with icon */}
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl">
              {style.category === 'basic'
                ? '⬜'
                : style.category === 'text'
                  ? '📝'
                  : style.category === 'advanced'
                    ? '🎭'
                    : '✨'}
            </div>
            {style.premium && (
              <div className="text-xs mt-1 text-accent-primary font-bold">PREMIUM</div>
            )}
          </div>
        </div>

        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center bg-accent-primary/20 backdrop-blur-sm">
            <div className="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center text-white text-xs">
              ✓
            </div>
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

        {/* AI Recommended Badge */}
        {isAIRecommended && (
          <div className="absolute top-0 left-0 px-2 py-1 bg-gradient-to-r from-accent-primary/90 to-accent-primary text-white text-xs rounded-br font-semibold flex items-center gap-1 shadow-sm">
            <span>✨</span>
            <span>AI</span>
          </div>
        )}
      </div>

      {/* Style Info */}
      <div className="text-left">
        <h3 className="font-semibold text-xs text-text-primary truncate">{style.name}</h3>
        <p className="text-xs text-text-tertiary capitalize truncate">{style.category}</p>
      </div>

      {/* Premium Badge */}
      {style.premium && (
        <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-accent-primary text-white text-xs rounded-bl font-medium">
          ✨
        </div>
      )}
    </button>
  );
};

export default CoverStyleGrid;
