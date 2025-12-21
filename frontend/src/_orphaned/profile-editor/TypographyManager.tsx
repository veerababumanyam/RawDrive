/**
 * Typography Manager Component
 *
 * Provides font selection and typography customization with
 * a curated list of web fonts and font pairing suggestions.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ChevronDown, Check, RefreshCw, Sparkles, Search } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import type { TypographyConfig, FontConfig } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface TypographyManagerProps {
  currentTypography?: Partial<TypographyConfig>;
  themeTypography?: TypographyConfig;
  onUpdate: (typography: Partial<TypographyConfig>) => void;
  workspaceId?: string;
}

interface FontCategory {
  value: 'serif' | 'sans-serif' | 'display' | 'handwriting';
  label: string;
}

interface WebFont {
  family: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting';
  weights: number[];
  preview: string;
}

interface FontPairing {
  heading: string;
  body: string;
  name: string;
  description: string;
}

// =============================================================================
// Constants
// =============================================================================

const FONT_CATEGORIES: FontCategory[] = [
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'handwriting', label: 'Script' },
];

const WEB_FONTS: WebFont[] = [
  // Sans Serif
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700], preview: 'Modern and clean' },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 600, 700], preview: 'Friendly and readable' },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700], preview: 'Geometric and neutral' },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700], preview: 'Geometric and friendly' },
  { family: 'Lato', category: 'sans-serif', weights: [300, 400, 700], preview: 'Warm and stable' },
  { family: 'Montserrat', category: 'sans-serif', weights: [400, 500, 600, 700], preview: 'Urban and elegant' },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700], preview: 'Low-contrast geometric' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [400, 500, 600, 700], preview: 'Contemporary and fresh' },

  // Serif
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700], preview: 'Elegant and high contrast' },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700], preview: 'Readable and pleasant' },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], preview: 'Well-balanced calligraphy' },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 600], preview: 'Classical and refined' },
  { family: 'Source Serif Pro', category: 'serif', weights: [400, 600, 700], preview: 'Clear and versatile' },

  // Display
  { family: 'Space Grotesk', category: 'display', weights: [400, 500, 600, 700], preview: 'Geometric display' },
  { family: 'Syne', category: 'display', weights: [400, 500, 600, 700], preview: 'Bold and expressive' },
  { family: 'Bebas Neue', category: 'display', weights: [400], preview: 'Condensed all-caps' },
  { family: 'Archivo Black', category: 'display', weights: [400], preview: 'Impactful grotesque' },

  // Handwriting
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700], preview: 'Casual and friendly' },
  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700], preview: 'Handwritten marker' },
  { family: 'Pacifico', category: 'handwriting', weights: [400], preview: 'Fun brush script' },
];

const FONT_PAIRINGS: FontPairing[] = [
  {
    heading: 'Playfair Display',
    body: 'Lato',
    name: 'Elegant Classic',
    description: 'Sophisticated serif with warm sans-serif',
  },
  {
    heading: 'Poppins',
    body: 'Open Sans',
    name: 'Modern Friendly',
    description: 'Geometric heading with readable body',
  },
  {
    heading: 'Space Grotesk',
    body: 'Inter',
    name: 'Tech Forward',
    description: 'Contemporary and clean',
  },
  {
    heading: 'Cormorant Garamond',
    body: 'Montserrat',
    name: 'Luxury Minimal',
    description: 'Classical serif with modern sans',
  },
  {
    heading: 'Plus Jakarta Sans',
    body: 'DM Sans',
    name: 'Sleek Duo',
    description: 'Two geometric sans for cohesion',
  },
  {
    heading: 'Syne',
    body: 'Inter',
    name: 'Bold Statement',
    description: 'Expressive headlines with clean body',
  },
];

// =============================================================================
// Component
// =============================================================================

export const TypographyManager: React.FC<TypographyManagerProps> = ({
  currentTypography,
  themeTypography,
  onUpdate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingFont, setEditingFont] = useState<'heading' | 'body' | null>(null);

  // Effective typography
  const effectiveTypography = useMemo(
    () => ({
      heading_font: currentTypography?.heading_font || themeTypography?.heading_font || {
        family: 'Inter',
        source: 'web' as const,
        fallback: ['system-ui', 'sans-serif'],
        weights: [600, 700],
      },
      body_font: currentTypography?.body_font || themeTypography?.body_font || {
        family: 'Inter',
        source: 'web' as const,
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    }),
    [currentTypography, themeTypography]
  );

  // Filtered fonts
  const filteredFonts = useMemo(() => {
    let result = [...WEB_FONTS];

    if (selectedCategory) {
      result = result.filter((font) => font.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((font) =>
        font.family.toLowerCase().includes(query)
      );
    }

    return result;
  }, [selectedCategory, searchQuery]);

  // Handle font selection
  const handleSelectFont = useCallback(
    (fontFamily: string) => {
      if (!editingFont) return;

      const font = WEB_FONTS.find((f) => f.family === fontFamily);
      if (!font) return;

      const fontConfig: FontConfig = {
        family: font.family,
        source: 'web',
        fallback:
          font.category === 'serif'
            ? ['Georgia', 'serif']
            : ['system-ui', 'sans-serif'],
        weights: font.weights,
      };

      if (editingFont === 'heading') {
        onUpdate({ heading_font: fontConfig });
      } else {
        onUpdate({ body_font: fontConfig });
      }

      setEditingFont(null);
    },
    [editingFont, onUpdate]
  );

  // Apply font pairing
  const handleApplyPairing = useCallback(
    (pairing: FontPairing) => {
      const headingFont = WEB_FONTS.find((f) => f.family === pairing.heading);
      const bodyFont = WEB_FONTS.find((f) => f.family === pairing.body);

      if (!headingFont || !bodyFont) return;

      onUpdate({
        heading_font: {
          family: headingFont.family,
          source: 'web',
          fallback:
            headingFont.category === 'serif'
              ? ['Georgia', 'serif']
              : ['system-ui', 'sans-serif'],
          weights: headingFont.weights,
        },
        body_font: {
          family: bodyFont.family,
          source: 'web',
          fallback:
            bodyFont.category === 'serif'
              ? ['Georgia', 'serif']
              : ['system-ui', 'sans-serif'],
          weights: bodyFont.weights,
        },
      });
    },
    [onUpdate]
  );

  // Reset to defaults
  const handleReset = useCallback(() => {
    onUpdate({
      heading_font: undefined,
      body_font: undefined,
    });
  }, [onUpdate]);

  const hasCustomizations = currentTypography?.heading_font || currentTypography?.body_font;

  return (
    <div className="p-4 space-y-6">
      {/* Font Pairings Suggestions */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <p className="text-sm font-medium text-text-primary">Suggested Pairings</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FONT_PAIRINGS.slice(0, 4).map((pairing) => (
            <button
              key={pairing.name}
              onClick={() => handleApplyPairing(pairing)}
              className="p-3 text-left border border-border rounded-lg hover:border-accent hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <p className="text-sm font-medium text-text-primary">{pairing.name}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{pairing.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Current Selection */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Current Fonts
        </p>

        {/* Heading Font */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Heading Font</label>
          <button
            onClick={() => setEditingFont(editingFont === 'heading' ? null : 'heading')}
            className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors ${
              editingFont === 'heading'
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-accent/50'
            }`}
            aria-expanded={editingFont === 'heading'}
          >
            <span
              className="text-lg font-semibold text-text-primary"
              style={{ fontFamily: effectiveTypography.heading_font.family }}
            >
              {effectiveTypography.heading_font.family}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-text-tertiary transition-transform ${
                editingFont === 'heading' ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Body Font */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Body Font</label>
          <button
            onClick={() => setEditingFont(editingFont === 'body' ? null : 'body')}
            className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors ${
              editingFont === 'body'
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-accent/50'
            }`}
            aria-expanded={editingFont === 'body'}
          >
            <span
              className="text-base text-text-primary"
              style={{ fontFamily: effectiveTypography.body_font.family }}
            >
              {effectiveTypography.body_font.family}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-text-tertiary transition-transform ${
                editingFont === 'body' ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Font Picker */}
      {editingFont && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search fonts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Search fonts"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="p-3 border-b border-border flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                !selectedCategory
                  ? 'bg-primary text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-surface'
              }`}
            >
              All
            </button>
            {FONT_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-text-secondary hover:bg-surface'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Font List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredFonts.length === 0 ? (
              <div className="p-4 text-center text-text-tertiary text-sm">
                No fonts match your search
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected =
                  editingFont === 'heading'
                    ? effectiveTypography.heading_font.family === font.family
                    : effectiveTypography.body_font.family === font.family;

                return (
                  <button
                    key={font.family}
                    onClick={() => handleSelectFont(font.family)}
                    className={`w-full flex items-center justify-between p-3 hover:bg-surface-hover transition-colors border-b border-border last:border-b-0 ${
                      isSelected ? 'bg-accent/5' : ''
                    }`}
                  >
                    <div>
                      <p
                        className="text-base text-text-primary"
                        style={{ fontFamily: font.family }}
                      >
                        {font.family}
                      </p>
                      <p className="text-xs text-text-tertiary">{font.preview}</p>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-accent flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary">Preview</p>
        <div className="p-4 bg-white border border-border rounded-lg space-y-2">
          <h3
            className="text-xl font-semibold text-text-primary"
            style={{ fontFamily: effectiveTypography.heading_font.family }}
          >
            Photography Portfolio
          </h3>
          <p
            className="text-sm text-text-secondary"
            style={{ fontFamily: effectiveTypography.body_font.family }}
          >
            Capturing moments that tell your story. Professional photography
            services for weddings, portraits, and events.
          </p>
        </div>
      </div>

      {/* Reset */}
      {hasCustomizations && (
        <div className="pt-2 border-t border-border">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="w-full text-text-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset to theme defaults
          </AppButton>
        </div>
      )}
    </div>
  );
};

export default TypographyManager;
