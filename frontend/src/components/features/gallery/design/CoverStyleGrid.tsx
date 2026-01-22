/**
 * Cover Style Grid Component - Enhanced Phase 1
 *
 * Features:
 * - Category filtering (basic, text, advanced, premium)
 * - Lazy loading for performance
 * - Search/filter by name and description
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Thumbnail pre-caching on category hover
 * - FadeIn animations with staggered timing
 * - Enhanced tooltips with descriptions
 * - Hover effects and selection states
 * - Premium badge indicators
 *
 * Feature: Gallery Design Studio - Cover Style Selection
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  COVER_STYLES,
  getCoverStylesByCategory,
} from '../../../../constants/coverStyleCatalog';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { StyleBadges } from './StyleBadges';
import { useRecentCoverStyles } from '../../../../hooks/useRecentCoverStyles';
import { useAICoverRecommendations } from '../../../../hooks/useAICoverRecommendations';
import { CoverStyleComparison } from './CoverStyleComparison';
import { CoverStylePreview } from './CoverStylePreview';
import {
  Layout,
  Type,
  Layers,
  Star,
  Lock,
  Search,
  X,
  ArrowRightLeft,
  Eye
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
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedStyleIndex, setFocusedStyleIndex] = useState(0);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonStyle, setComparisonStyle] = useState<string | null>(null); // Style to compare with selected
  const [showPreview, setShowPreview] = useState(false); // Phase 2.5: Full-page preview
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Track recently used styles
  const { recentStyles, addRecentStyle, isLoaded: recentStylesLoaded } = useRecentCoverStyles(5);

  // AI-powered recommendations - Phase 2.3
  const { recordSelection, getRecommendations, isLoaded: aiLoaded } = useAICoverRecommendations();

  // Get trending and new styles for recommendation scoring
  const trendingStyles = useMemo(() => COVER_STYLES.filter(s => s.isTrending).map(s => s.id), []);
  const newStyles = useMemo(() => COVER_STYLES.filter(s => s.isNew).map(s => s.id), []);

  // Calculate AI-powered recommendations
  const aiRecommendedStyleIds = useMemo(() => {
    if (!aiLoaded || selectedStyle === '') return [];
    return getRecommendations(COVER_STYLES, selectedStyle, isPremiumUser, 5, trendingStyles, newStyles);
  }, [aiLoaded, selectedStyle, isPremiumUser, getRecommendations, trendingStyles, newStyles]);

  // Get filtered styles by category
  const categoryFilteredStyles = category === 'all' ? COVER_STYLES : getCoverStylesByCategory(category);

  // Apply search filter on top of category filter
  const filteredStyles = searchQuery.trim() === ''
    ? categoryFilteredStyles
    : categoryFilteredStyles.filter(style =>
        style.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        style.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

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

  // Handle style selection with premium check and recent tracking
  const handleStyleSelect = useCallback((style: typeof filteredStyles[0]) => {
    if (style.premium && !isPremiumUser) {
      // Block premium style for non-premium users
      onPremiumStyleBlocked?.(style.id, style.name);
    } else {
      // Allow selection and track as recent + record for AI recommendations
      onSelectStyle(style.id);
      addRecentStyle(style.id);
      recordSelection(style.id, style.category); // Phase 2.3: Track for AI recommendations
    }
  }, [isPremiumUser, onPremiumStyleBlocked, onSelectStyle, addRecentStyle, recordSelection]);

  // Pre-cache thumbnails for a category
  const preCacheThumbnails = useCallback((categoryId: 'all' | 'basic' | 'text' | 'advanced' | 'premium') => {
    const stylesToCache = categoryId === 'all' ? COVER_STYLES : getCoverStylesByCategory(categoryId);
    stylesToCache.forEach(style => {
      if (style.thumbnail) {
        const img = new Image();
        img.src = style.thumbnail;
      }
    });
  }, []);

  // Handle category change with pre-caching
  const handleCategoryChange = useCallback((newCategory: 'all' | 'basic' | 'text' | 'advanced' | 'premium') => {
    setVisibleRange({ start: 0, end: 12 });
    setSearchQuery('');
    setFocusedStyleIndex(0);
    onCategoryChange?.(newCategory);
  }, [onCategoryChange]);

  // Handle comparison initiation - Phase 2.4
  const handleCompare = useCallback((styleId: string) => {
    if (selectedStyle === '') return; // No style selected
    setComparisonStyle(styleId);
    setShowComparison(true);
  }, [selectedStyle]);

  // Get style objects for comparison
  const selectedStyleObj = useMemo(() => COVER_STYLES.find(s => s.id === selectedStyle), [selectedStyle]);
  const comparisonStyleObj = useMemo(() => comparisonStyle ? COVER_STYLES.find(s => s.id === comparisonStyle) : null, [comparisonStyle]);

  // Handle keyboard navigation (works with both div and button elements)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<any>) => {
    if (!gridRef.current) return;

    const visibleCount = visibleStyles.length;
    if (visibleCount === 0) return;

    const cols = 3; // grid-cols-3

    let newIndex = focusedStyleIndex;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        newIndex = Math.min(focusedStyleIndex + cols, visibleCount - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        newIndex = Math.max(focusedStyleIndex - cols, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = Math.min(focusedStyleIndex + 1, visibleCount - 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = Math.max(focusedStyleIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        handleStyleSelect(visibleStyles[focusedStyleIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        setFocusedStyleIndex(0);
        break;
      default:
        return;
    }

    setFocusedStyleIndex(newIndex);

    // Focus the item in the grid
    const items = gridRef.current?.querySelectorAll('[data-style-item]');
    if (items && items[newIndex]) {
      (items[newIndex] as HTMLButtonElement).focus();
    }
  }, [focusedStyleIndex, visibleStyles, handleStyleSelect]);

  return (
    <div className="space-y-4">
      {/* Search Input - Phase 1 Enhancement */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleRange({ start: 0, end: 12 });
            setFocusedStyleIndex(0);
          }}
          placeholder="Search styles by name or description..."
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-white/40 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setVisibleRange({ start: 0, end: 12 });
              setFocusedStyleIndex(0);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Recent Styles Section - Phase 2 */}
      {recentStylesLoaded && recentStyles.length > 0 && !searchQuery && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Recently Used</h3>
          <div className="grid grid-cols-5 gap-2">
            {recentStyles.slice(0, 5).map(styleId => {
              const style = COVER_STYLES.find(s => s.id === styleId);
              if (!style) return null;
              return (
                <button
                  key={styleId}
                  onClick={() => handleStyleSelect(style)}
                  className={`relative aspect-square p-1 rounded-lg border-2 transition-all duration-200 ${
                    selectedStyle === styleId
                      ? 'border-cyan-400 bg-cyan-400/10 shadow-lg scale-105'
                      : 'border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:border-gray-400 dark:hover:border-white/20'
                  }`}
                  title={style.name}
                >
                  {style.thumbnail && (
                    <img
                      src={style.thumbnail}
                      alt={style.name}
                      className="w-full h-full object-cover rounded-md"
                      loading="lazy"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Tabs - Responsive Glass Segmented Control with Pre-caching */}
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
            onClick={() => handleCategoryChange(id)}
            onMouseEnter={() => preCacheThumbnails(id)}
            className={`flex-1 px-2 sm:px-3 py-1.5 text-[8px] sm:text-[10px] font-semibold tracking-wide rounded-lg sm:rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black whitespace-nowrap ${category === id
              ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
              : 'text-gray-600 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/70 hover:bg-gray-200 dark:hover:bg-white/5 hover:scale-[1.01]'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Styles Grid - Enhanced with animations and keyboard navigation */}
      <div
        ref={gridRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="grid grid-cols-3 gap-3 focus:outline-none"
        style={{
          animation: visibleStyles.length > 0 ? 'none' : undefined
        }}
      >
        {visibleStyles.map((style, index) => (
          <CoverStyleGridItem
            key={style.id}
            style={style}
            isSelected={selectedStyle === style.id}
            onSelect={() => handleStyleSelect(style)}
            isAIRecommended={aiRecommendedStyleIds.includes(style.id)}
            isLocked={style.premium && !isPremiumUser}
            isFocused={focusedStyleIndex === index}
            animationDelay={index * 40}
            onKeyDown={handleKeyDown}
            isNew={style.isNew}
            isTrending={style.isTrending}
            onCompare={selectedStyle ? () => handleCompare(style.id) : undefined}
            onPreview={selectedStyle ? () => setShowPreview(true) : undefined}
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

      {/* Comparison Modal - Phase 2.4 */}
      {showComparison && selectedStyleObj && comparisonStyleObj && (
        <CoverStyleComparison
          style1={selectedStyleObj}
          style2={comparisonStyleObj}
          onClose={() => setShowComparison(false)}
          onSwap={() => {
            setComparisonStyle(selectedStyle);
            setShowComparison(true);
          }}
          onSelect={(styleId: string) => {
            onSelectStyle(styleId);
            setShowComparison(false);
          }}
          isPremiumUser={isPremiumUser}
        />
      )}

      {/* Full-Page Preview Modal - Phase 2.5 */}
      {showPreview && selectedStyleObj && (
        <CoverStylePreview
          style={selectedStyleObj}
          onClose={() => setShowPreview(false)}
          onSelectDifferent={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};

/**
 * Individual Cover Style Grid Item - Enhanced Phase 1
 *
 * Features:
 * - FadeIn animation with customizable delay
 * - Enhanced tooltip with description
 * - Keyboard navigation support
 * - Focus styling
 */
interface CoverStyleGridItemProps {
  style: any;
  isSelected: boolean;
  onSelect: () => void;
  isAIRecommended?: boolean;
  isLocked?: boolean;
  isFocused?: boolean;
  animationDelay?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  isNew?: boolean;
  isTrending?: boolean;
  onCompare?: () => void;
  onPreview?: () => void;
}

const CoverStyleGridItem: React.FC<CoverStyleGridItemProps> = ({
  style,
  isSelected,
  onSelect,
  isAIRecommended,
  isLocked = false,
  isFocused = false,
  animationDelay = 0,
  onKeyDown,
  isNew,
  isTrending,
  onCompare,
  onPreview,
}) => {
  // Enhanced tooltip content with description
  const tooltipContent = {
    title: style.name,
    description: style.description,
    category: style.category,
    isPremium: style.premium,
    isLocked: isLocked,
  };

  return (
    <DesignStudioTooltip content={tooltipContent}>
      <button
        data-style-item
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={`group relative p-2.5 rounded-2xl border transition-all duration-300 focus:outline-none ${
          isFocused
            ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-white dark:ring-offset-black'
            : 'focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black'
        } ${isSelected
          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)] scale-[1.02]'
          : isLocked
            ? 'border-gray-300 dark:border-white/10 bg-gray-200 dark:bg-black/20 opacity-60 hover:opacity-100 hover:border-amber-400/50'
            : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:scale-[1.01]'
          } ${isLocked ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
        style={{
          animation: `fadeInScale 0.4s ease-out forwards`,
          animationDelay: `${animationDelay}ms`,
        }}
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

          {/* Phase 2 Badges: New, Trending, Premium, Locked, + AI Recommended */}
          <div className="absolute top-1 right-1">
            <StyleBadges
              isNew={isNew}
              isTrending={isTrending}
              isPremium={style.premium}
              isLocked={isLocked}
              size="sm"
            />
          </div>

          {/* AI Recommended Badge */}
          {isAIRecommended && (
            <div className="absolute top-12 right-1">
              <div className="px-1.5 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[8px] rounded-lg font-black tracking-tighter uppercase shadow-lg">
                AI
              </div>
            </div>
          )}
        </div>

        {/* Style Info - Centered Alignment */}
        <div className="flex flex-col items-center px-1 gap-2">
          <div className="flex-1">
            <div className={`text-[10px] font-semibold tracking-wide text-center transition-colors ${isSelected ? 'text-cyan-400' : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'}`}>
              {style.name}
            </div>
            <div className="text-[9px] text-gray-600 dark:text-white/50 font-medium truncate mt-0.5 text-center group-hover:text-gray-700 dark:group-hover:text-white/70 transition-colors">
              {style.category}
            </div>
          </div>

          {/* Compare & Preview Buttons - Phase 2.4 & 2.5 */}
          {isSelected && (
            <div className="w-full flex gap-2">
              {onCompare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCompare();
                  }}
                  className="flex-1 px-1.5 py-1 rounded-lg text-[6px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center gap-0.5"
                  title="Compare with another style"
                >
                  <ArrowRightLeft className="w-2 h-2" />
                  Compare
                </button>
              )}
              {onPreview && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                  className="flex-1 px-1.5 py-1 rounded-lg text-[6px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-400 to-pink-500 text-white hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center gap-0.5"
                  title="Preview full-page"
                >
                  <Eye className="w-2 h-2" />
                  Preview
                </button>
              )}
            </div>
          )}
        </div>
      </button>
    </DesignStudioTooltip>
  );
};

export default CoverStyleGrid;

// CSS Animation Styles for fadeInScale
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

// Only add if not already added
if (!document.querySelector('style[data-cover-animations]')) {
  styleSheet.setAttribute('data-cover-animations', 'true');
  document.head.appendChild(styleSheet);
}
