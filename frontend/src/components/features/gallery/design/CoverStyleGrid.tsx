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
      {/* Category Tabs - Glass Segmented Control */}
      <div className="flex flex-wrap bg-black/20 backdrop-blur-md rounded-2xl p-1.5 border border-white/5 gap-1">
        {[
          { id: 'all' as const, label: 'All', count: stats.total },
          { id: 'basic' as const, label: 'Basic', count: stats.byCategory.basic },
          { id: 'text' as const, label: 'Text', count: stats.byCategory.text },
          { id: 'advanced' as const, label: 'Special', count: stats.byCategory.advanced },
          { id: 'premium' as const, label: 'Premium', count: stats.byCategory.premium },
        ].map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => {
              setVisibleRange({ start: 0, end: 12 });
              onCategoryChange?.(id);
            }}
            className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300 ${category === id
              ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
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
        className={`group relative p-2.5 rounded-2xl border transition-all duration-300 ${isSelected
          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
          : isLocked
            ? 'border-white/10 bg-black/20 opacity-60 hover:opacity-100 hover:border-amber-400/50'
            : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
          } ${isLocked ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-square mb-3 rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-inner group-hover:border-white/20 transition-colors">
          {/* Placeholder/Icon representation */}
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 group-hover:scale-110 transition-transform duration-500">
            <div className="text-white opacity-40">
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
          <div className={`text-[10px] font-bold uppercase tracking-widest text-center transition-colors ${isSelected ? 'text-cyan-400' : 'text-white/80 group-hover:text-white'}`}>
            {style.name}
          </div>
          <div className="text-[9px] text-white/30 font-medium truncate mt-0.5 text-center group-hover:text-white/50 transition-colors">
            {style.category}
          </div>
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

export default CoverStyleGrid;
