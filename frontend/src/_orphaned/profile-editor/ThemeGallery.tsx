/**
 * Theme Gallery Component
 *
 * Displays available themes in a browsable gallery format with
 * category filtering, search, and live preview thumbnails.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Check, Crown, Sparkles, X } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { profileEditorService } from '@/services/profileEditorService';
import type { Theme, ThemeCategory } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface ThemeGalleryProps {
  selectedThemeId?: string;
  onSelectTheme: (themeId: string) => Promise<void>;
  workspaceId?: string;
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORIES: { value: ThemeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Themes' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
  { value: 'elegant', label: 'Elegant' },
  { value: 'modern', label: 'Modern' },
  { value: 'creative', label: 'Creative' },
];

// =============================================================================
// Component
// =============================================================================

export const ThemeGallery: React.FC<ThemeGalleryProps> = ({
  selectedThemeId,
  onSelectTheme,
}) => {
  // State
  const [themes, setThemes] = useState<Theme[]>([]);
  const [filteredThemes, setFilteredThemes] = useState<Theme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory | 'all'>('all');
  const [showPopularOnly, setShowPopularOnly] = useState(false);
  const [applyingThemeId, setApplyingThemeId] = useState<string | null>(null);

  // Fetch themes
  useEffect(() => {
    const fetchThemes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await profileEditorService.getThemes();
        setThemes(data);
        setFilteredThemes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load themes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchThemes();
  }, []);

  // Filter themes
  useEffect(() => {
    let result = [...themes];

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((theme) => theme.category === selectedCategory);
    }

    // Filter by popular
    if (showPopularOnly) {
      result = result.filter((theme) => theme.is_popular);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (theme) =>
          theme.name.toLowerCase().includes(query) ||
          theme.description.toLowerCase().includes(query) ||
          theme.category.toLowerCase().includes(query)
      );
    }

    setFilteredThemes(result);
  }, [themes, selectedCategory, showPopularOnly, searchQuery]);

  // Handle theme selection
  const handleSelectTheme = useCallback(
    async (themeId: string) => {
      if (themeId === selectedThemeId) return;

      setApplyingThemeId(themeId);
      try {
        await onSelectTheme(themeId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply theme');
      } finally {
        setApplyingThemeId(null);
      }
    },
    [selectedThemeId, onSelectTheme]
  );

  // Clear filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('all');
    setShowPopularOnly(false);
  }, []);

  const hasActiveFilters =
    searchQuery.trim() !== '' || selectedCategory !== 'all' || showPopularOnly;

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-[4/3] bg-surface-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-error text-sm mb-2">{error}</p>
        <AppButton variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </AppButton>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Search themes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          aria-label="Search themes"
        />
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            onClick={() => setSelectedCategory(category.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              selectedCategory === category.value
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-secondary hover:bg-surface'
            }`}
            aria-pressed={selectedCategory === category.value}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Popular Filter */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowPopularOnly(!showPopularOnly)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showPopularOnly
              ? 'bg-accent/10 text-accent border border-accent'
              : 'bg-surface-hover text-text-secondary hover:bg-surface border border-transparent'
          }`}
          aria-pressed={showPopularOnly}
        >
          <Sparkles className="w-3 h-3" />
          Popular
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}
      </div>

      {/* Theme Grid */}
      {filteredThemes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-tertiary text-sm">No themes match your filters</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredThemes.map((theme) => (
            <ThemeCard
              key={theme.theme_id}
              theme={theme}
              isSelected={theme.theme_id === selectedThemeId}
              isApplying={theme.theme_id === applyingThemeId}
              onSelect={() => handleSelectTheme(theme.theme_id)}
            />
          ))}
        </div>
      )}

      {/* Results Count */}
      <p className="text-xs text-text-tertiary text-center">
        {filteredThemes.length} of {themes.length} themes
      </p>
    </div>
  );
};

// =============================================================================
// Theme Card Component
// =============================================================================

interface ThemeCardProps {
  theme: Theme;
  isSelected: boolean;
  isApplying: boolean;
  onSelect: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  isSelected,
  isApplying,
  onSelect,
}) => {
  // Generate gradient preview from theme colors
  const gradientStyle = theme.base_colors.gradients?.[0]
    ? {
        background: `linear-gradient(${theme.base_colors.gradients[0].direction || '135deg'}, ${theme.base_colors.gradients[0].stops.join(', ')})`,
      }
    : {
        background: `linear-gradient(135deg, ${theme.base_colors.primary}, ${theme.base_colors.accent})`,
      };

  return (
    <button
      onClick={onSelect}
      disabled={isApplying || isSelected}
      className={`relative group aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        isSelected
          ? 'border-accent shadow-lg'
          : 'border-border hover:border-accent/50 hover:shadow-md'
      } ${isApplying ? 'opacity-70' : ''}`}
      aria-pressed={isSelected}
      aria-label={`Select ${theme.name} theme${isSelected ? ' (currently selected)' : ''}`}
    >
      {/* Theme Preview */}
      <div className="absolute inset-0" style={gradientStyle}>
        {/* Preview Elements */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
          {/* Mock Logo */}
          <div
            className="w-10 h-10 rounded-full mb-2 shadow-sm"
            style={{ backgroundColor: theme.variants?.[0]?.colors.surface || '#ffffff' }}
          />
          {/* Mock Text */}
          <div
            className="w-16 h-2 rounded mb-1"
            style={{ backgroundColor: theme.variants?.[0]?.colors.text_primary || '#000000' }}
          />
          <div
            className="w-12 h-1.5 rounded opacity-60"
            style={{ backgroundColor: theme.variants?.[0]?.colors.text_secondary || '#666666' }}
          />
        </div>
      </div>

      {/* Badges */}
      <div className="absolute top-2 left-2 flex gap-1">
        {theme.is_premium && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gold text-white text-[10px] font-medium rounded">
            <Crown className="w-2.5 h-2.5" />
            Pro
          </span>
        )}
        {theme.is_popular && !theme.is_premium && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-accent text-white text-[10px] font-medium rounded">
            <Sparkles className="w-2.5 h-2.5" />
            Popular
          </span>
        )}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-accent text-white rounded-full flex items-center justify-center">
          <Check className="w-3 h-3" />
        </div>
      )}

      {/* Loading Indicator */}
      {isApplying && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Theme Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-white text-xs font-medium truncate">{theme.name}</p>
      </div>

      {/* Dark Mode Indicator */}
      {theme.supports_dark_mode && (
        <div
          className="absolute bottom-2 right-2 w-4 h-4 rounded-full border border-white/30"
          style={{
            background: `linear-gradient(135deg, ${theme.variants?.[0]?.colors.background || '#fff'} 50%, ${theme.variants?.[1]?.colors.background || '#1a1a1a'} 50%)`,
          }}
          title="Supports dark mode"
        />
      )}
    </button>
  );
};

export default ThemeGallery;
