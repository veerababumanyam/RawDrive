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
} from '../../../../constants/coverStyleCatalog';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import {
  Layout,
  Type,
  Layers,
  Star,
  Lock
} from 'lucide-react';

interface CoverStyleGridProps {
  selectedStyle: string;
  onSelectStyle: (styleId: string) => void;
  category?: 'all' | 'basic' | 'text' | 'advanced' | 'premium';
  onCategoryChange?: (category: 'all' | 'basic' | 'text' | 'advanced' | 'premium') => void;
  aiRecommendedStyles?: string[]; // Style IDs that are AI-recommended
  isPremiumUser?: boolean; // Whether user has premium subscription
  onPremiumStyleBlocked?: (styleId: string, styleName: string) => void; // Called when non-premium user clicks premium style
}

export const CoverStyleGrid: React.FC<CoverStyleGridProps> = ({
  selectedStyle,
  onSelectStyle,
  category = 'all',
  onCategoryChange,
  aiRecommendedStyles = [],
  isPremiumUser = false,
  onPremiumStyleBlocked,
}) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 12 });
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get filtered styles
  const filteredStyles = category === 'all' ? COVER_STYLES : getCoverStylesByCategory(category);

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

  // Handle style selection with premium check
  const handleStyleSelect = useCallback((style: typeof filteredStyles[0]) => {
    if (style.premium && !isPremiumUser) {
      // Block premium style for non-premium users
      onPremiumStyleBlocked?.(style.id, style.name);
    } else {
      // Allow selection
      onSelectStyle(style.id);
    }
  }, [isPremiumUser, onPremiumStyleBlocked, onSelectStyle]);

  return (
    <div className="space-y-4">
      {/* Category Tabs - Responsive Glass Segmented Control */}
      <div className="flex flex-wrap sm:flex-nowrap bg-gray-100 dark:bg-black/20 backdrop-blur-md rounded-2xl p-1 sm:p-1.5 border border-gray-200 dark:border-white/5 gap-0.5 sm:gap-1">
        {[
          { id: 'all' as const, label: 'All' },
          { id: 'basic' as const, label: 'Basic' },
          { id: 'text' as const, label: 'Text' },
          { id: 'advanced' as const, label: 'Special' },
          { id: 'premium' as const, label: 'Premium' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              setVisibleRange({ start: 0, end: 12 });
              onCategoryChange?.(id);
            }}
            className={`flex-1 px-2 sm:px-3 py-1.5 text-[8px] sm:text-[10px] font-semibold tracking-wide rounded-lg sm:rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black whitespace-nowrap ${category === id
              ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
              : 'text-gray-600 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/70 hover:bg-gray-200 dark:hover:bg-white/5 hover:scale-[1.01]'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Styles Grid */}
      <div ref={containerRef} className="grid grid-cols-3 gap-3">
        {visibleStyles.map((style) => (
          <CoverStyleGridItem
            key={style.id}
            style={style}
            isSelected={selectedStyle === style.id}
            onSelect={() => handleStyleSelect(style)}
            isAIRecommended={aiRecommendedStyles.includes(style.id)}
            isLocked={style.premium && !isPremiumUser}
          />
        ))}
      </div>

      {/* Loading Sentinel */}
      {visibleRange.end < filteredStyles.length && (
        <div ref={sentinelRef} className="py-4 text-center">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Loading more styles ({visibleRange.end} of {filteredStyles.length})...
          </p>
        </div>
      )}

      {/* End of List */}
      {visibleRange.end >= filteredStyles.length && filteredStyles.length > 0 && (
        <div className="py-2 text-center">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Showing all {filteredStyles.length} styles
          </p>
        </div>
      )}

      {filteredStyles.length === 0 && (
        <div className="py-12 px-6 text-center bg-gray-100 dark:bg-white/5 rounded-2xl border border-gray-300 dark:border-white/10">
          <div className="text-gray-400 dark:text-white/40 mb-3">
            <svg className="w-12 h-12 mx-auto opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-white/60 text-sm font-medium">No styles in this category</p>
          <p className="text-gray-500 dark:text-white/40 text-xs mt-2">Try selecting a different category to see more options</p>
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
  isLocked?: boolean;
}

const CoverStyleGridItem: React.FC<CoverStyleGridItemProps> = ({
  style,
  isSelected,
  onSelect,
  isAIRecommended,
  isLocked = false,
}) => {
  return (
    <DesignStudioTooltip content={isLocked ? `${style.name} (Premium Required)` : style.name}>
      <button
        onClick={onSelect}
        className={`group relative p-2.5 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${isSelected
          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
          : isLocked
            ? 'border-gray-300 dark:border-white/10 bg-gray-200 dark:bg-black/20 opacity-60 hover:opacity-100 hover:border-amber-400/50'
            : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
          } ${isLocked ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-square mb-3 rounded-xl overflow-hidden bg-gray-200 dark:bg-white/5 border border-gray-300 dark:border-white/10 shadow-inner group-hover:border-gray-400 dark:group-hover:border-white/20 transition-colors">
          {/* SVG Thumbnail Image with Fallback Icon */}
          {style.thumbnail ? (
            <img
              src={style.thumbnail}
              alt={`${style.name} style preview`}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
              onError={(e) => {
                // Fallback to placeholder icon if image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}

          {/* Placeholder/Icon representation (fallback if thumbnail missing) */}
          <div className="w-full h-full absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 group-hover:scale-110 transition-transform duration-500 bg-gray-100 dark:bg-white/[0.02]" id={`fallback-${style.id}`}>
            <div className="text-gray-500 dark:text-white opacity-40">
              {style.category === 'basic' ? <Layout className="w-8 h-8" /> :
                style.category === 'text' ? <Type className="w-8 h-8" /> :
                  style.category === 'advanced' ? <Layers className="w-8 h-8" /> : <Star className="w-8 h-8 text-cyan-400" />}
            </div>
          </div>

          {/* Selection Indicator - Liquid Glow */}
          {isSelected && (
            <div className="absolute inset-0 flex items-center justify-center bg-cyan-400/20 backdrop-blur-[2px]">
              <div className="w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center text-[#0a1628] text-[10px] font-bold shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                ✓
              </div>
            </div>
          )}

          {/* Premium/AI Badges */}
          <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
            {style.premium && (
              <div className={`px-1.5 py-0.5 rounded-lg text-[8px] font-black tracking-tighter uppercase flex items-center gap-1 ${isLocked ? 'bg-amber-500 text-white' : 'bg-cyan-400 text-black'}`}>
                {isLocked ? <Lock className="w-3 h-3" /> : 'PRO'}
              </div>
            )}
            {isAIRecommended && (
              <div className="px-1.5 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[8px] rounded-lg font-black tracking-tighter uppercase shadow-lg">
                AI
              </div>
            )}
          </div>
        </div>

        {/* Style Info - Centered Alignment */}
        <div className="flex flex-col items-center px-1">
          <div className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${isSelected ? 'text-cyan-400' : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'}`}>
            {style.name}
          </div>
          <div className="text-[9px] text-gray-600 dark:text-white/50 font-medium truncate mt-0.5 text-center group-hover:text-gray-700 dark:group-hover:text-white/70 transition-colors">
            {style.category}
          </div>
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

export default CoverStyleGrid;
