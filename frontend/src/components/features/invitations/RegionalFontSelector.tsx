/**
 * RegionalFontSelector: Regional script-aware font selector with live preview
 *
 * Features:
 * - Live preview in regional scripts (Hindi, Tamil, Telugu, Kannada, Malayalam, etc.)
 * - Font grouping by script type (Devanagari, Dravidian, etc.)
 * - Google Fonts integration with lazy loading
 * - Accessible keyboard navigation
 * - Customizable preview text
 * - Weight selection for supported fonts
 *
 * Task: T004 - Create frontend font selector with regional script preview
 * Phase: Phase 1 - Multi-Language & Regional Font Support
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Type,
  ChevronDown,
  Check,
  Loader2,
  Globe,
  Sparkles,
  Eye,
  Languages,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { Modal as AppModal } from '@/components/ui/Modal';
import {
  INDIAN_LANGUAGE_FONTS,
  getFontsForLanguage,
  getDefaultFont,
  FONT_CATEGORY_LABELS,
  type FontOption,
  type LanguageFontConfig,
} from '@/config/indianFonts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegionalFontSelectorProps {
  /** The language code to show fonts for (e.g., 'hi', 'ta', 'te', 'kn', 'ml') */
  languageCode: string;
  /** Currently selected font family */
  selectedFont: string;
  /** Currently selected font weight (default: 400) */
  selectedWeight?: number;
  /** Callback when font is selected */
  onFontChange: (fontFamily: string, fontName: string, weight?: number) => void;
  /** Custom preview text (overrides default language preview) */
  customPreviewText?: string;
  /** Show weight selector */
  showWeightSelector?: boolean;
  /** Compact mode for inline usage */
  compact?: boolean;
  /** Label for the selector */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Optional className */
  className?: string;
}

export interface ScriptGroup {
  id: string;
  name: string;
  nativeName: string;
  scripts: string[];
  languages: LanguageFontConfig[];
  icon?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Script Grouping Configuration
// ---------------------------------------------------------------------------

const SCRIPT_GROUPS: Record<string, ScriptGroup> = {
  devanagari: {
    id: 'devanagari',
    name: 'Devanagari Scripts',
    nativeName: 'देवनागरी',
    scripts: ['Devanagari'],
    languages: [],
    icon: <span className="text-lg">क</span>,
  },
  dravidian: {
    id: 'dravidian',
    name: 'South Indian Scripts',
    nativeName: 'దక్షిణ భారత',
    scripts: ['Telugu', 'Tamil', 'Kannada', 'Malayalam'],
    languages: [],
    icon: <span className="text-lg">అ</span>,
  },
  eastern: {
    id: 'eastern',
    name: 'Eastern Scripts',
    nativeName: 'পূর্বী',
    scripts: ['Bengali', 'Oriya'],
    languages: [],
    icon: <span className="text-lg">অ</span>,
  },
  western: {
    id: 'western',
    name: 'Western Scripts',
    nativeName: 'પશ્ચિમી',
    scripts: ['Gujarati', 'Gurmukhi'],
    languages: [],
    icon: <span className="text-lg">ગ</span>,
  },
  persianArabic: {
    id: 'persianArabic',
    name: 'Perso-Arabic Scripts',
    nativeName: 'اردو',
    scripts: ['Arabic'],
    languages: [],
    icon: <span className="text-lg">ا</span>,
  },
  latin: {
    id: 'latin',
    name: 'Latin Scripts',
    nativeName: 'English',
    scripts: ['Latin'],
    languages: [],
    icon: <span className="text-lg">A</span>,
  },
};

// ---------------------------------------------------------------------------
// Regional Sample Text for Preview
// ---------------------------------------------------------------------------

const REGIONAL_PREVIEW_SAMPLES: Record<string, { heading: string; body: string; auspicious: string }> = {
  hi: {
    heading: 'शुभ विवाह',
    body: 'आप सादर आमंत्रित हैं',
    auspicious: '॥ श्री गणेशाय नमः ॥',
  },
  mr: {
    heading: 'शुभ मंगल',
    body: 'आपणास हार्दिक निमंत्रण',
    auspicious: '॥ श्री गणेशाय नमः ॥',
  },
  ta: {
    heading: 'திருமண விழா',
    body: 'உங்களை அன்புடன் அழைக்கிறோம்',
    auspicious: '॥ பிள்ளையார் சுழி ॥',
  },
  te: {
    heading: 'శుభ వివాహం',
    body: 'మిమ్మల్ని ఆహ్వానిస్తున్నాము',
    auspicious: '॥ శ్రీ గణేశాయ నమః ॥',
  },
  kn: {
    heading: 'ಶುಭ ವಿವಾಹ',
    body: 'ನಿಮ್ಮನ್ನು ಪ್ರೀತಿಯಿಂದ ಆಹ್ವಾನಿಸುತ್ತೇವೆ',
    auspicious: '॥ ಶ್ರೀ ಗಣೇಶಾಯ ನಮಃ ॥',
  },
  ml: {
    heading: 'വിവാഹ ക്ഷണം',
    body: 'നിങ്ങളെ സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു',
    auspicious: '॥ ശ്രീ ഗണേശായ നമഃ ॥',
  },
  bn: {
    heading: 'শুভ বিবাহ',
    body: 'আপনাকে সাদর আমন্ত্রণ',
    auspicious: '॥ শ্রী গণেশায় নমঃ ॥',
  },
  gu: {
    heading: 'શુભ લગ્ન',
    body: 'આપને પ્રેમથી આમંત્રણ',
    auspicious: '॥ શ્રી ગણેશાય નમઃ ॥',
  },
  pa: {
    heading: 'ਸ਼ੁਭ ਵਿਆਹ',
    body: 'ਤੁਹਾਨੂੰ ਪਿਆਰ ਨਾਲ ਸੱਦਾ',
    auspicious: '॥ ਵਾਹਿਗੁਰੂ ॥',
  },
  ur: {
    heading: 'مبارک شادی',
    body: 'آپ کو دعوت نامہ',
    auspicious: '॥ بسم اللہ ॥',
  },
  en: {
    heading: 'Wedding Invitation',
    body: 'You are cordially invited',
    auspicious: 'Save the Date',
  },
};

// ---------------------------------------------------------------------------
// Font Weight Labels
// ---------------------------------------------------------------------------

const FONT_WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

// ---------------------------------------------------------------------------
// Font Preview Card Component
// ---------------------------------------------------------------------------

interface FontPreviewCardProps {
  font: FontOption;
  isSelected: boolean;
  onSelect: () => void;
  languageCode: string;
  customPreviewText?: string;
  selectedWeight?: number;
  onWeightChange?: (weight: number) => void;
  showWeights?: boolean;
}

const FontPreviewCard: React.FC<FontPreviewCardProps> = ({
  font,
  isSelected,
  onSelect,
  languageCode,
  customPreviewText,
  selectedWeight = 400,
  onWeightChange,
  showWeights = false,
}) => {
  const [fontLoaded, setFontLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const linkRef = useRef<HTMLLinkElement | null>(null);

  // Get preview samples for the language
  const previewSamples = REGIONAL_PREVIEW_SAMPLES[languageCode] || REGIONAL_PREVIEW_SAMPLES.en;

  // Load font on mount
  useEffect(() => {
    // Check if font is already loaded
    if (document.fonts.check(`1em ${font.family.replace(/'/g, '')}`)) {
      setFontLoaded(true);
      return;
    }

    // Create link element to load font
    const link = document.createElement('link');
    link.href = font.googleFontsUrl;
    link.rel = 'stylesheet';
    link.onload = () => setFontLoaded(true);
    link.onerror = () => setFontLoaded(true); // Show anyway even if fails
    document.head.appendChild(link);
    linkRef.current = link;

    return () => {
      // Keep font loaded for reuse
    };
  }, [font.googleFontsUrl, font.family]);

  const categoryColors = {
    display: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    body: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    traditional: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative w-full text-left p-4 rounded-xl border-2 transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none
        cursor-pointer
        ${
          isSelected
            ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-lg shadow-primary/10'
            : 'border-border hover:border-primary/40 hover:bg-surface-hover hover:shadow-md'
        }
      `}
      aria-pressed={isSelected}
      aria-label={`Select ${font.name} font`}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-3 left-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Category badge */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`
            px-2.5 py-1 text-xs font-medium rounded-full border
            ${categoryColors[font.category]}
            ${isSelected ? 'ml-8' : ''}
          `}
        >
          {FONT_CATEGORY_LABELS[font.category]}
        </span>
        {isHovered && !fontLoaded && (
          <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
        )}
      </div>

      {/* Font name */}
      <p className="text-sm font-semibold text-text-primary mb-3">{font.name}</p>

      {/* Preview text area */}
      <div className="space-y-2 min-h-[80px]">
        {fontLoaded ? (
          <>
            {/* Auspicious text preview */}
            <p
              className="text-xs text-text-tertiary leading-relaxed opacity-75"
              style={{
                fontFamily: font.family,
                fontWeight: selectedWeight,
              }}
            >
              {previewSamples.auspicious}
            </p>

            {/* Heading preview */}
            <p
              className="text-xl font-bold text-text-primary leading-relaxed"
              style={{
                fontFamily: font.family,
                fontWeight: Math.min(selectedWeight + 200, 900),
              }}
            >
              {customPreviewText || previewSamples.heading}
            </p>

            {/* Body text preview */}
            <p
              className="text-base text-text-secondary leading-relaxed"
              style={{
                fontFamily: font.family,
                fontWeight: selectedWeight,
              }}
            >
              {font.previewText || previewSamples.body}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-[80px] gap-2 text-text-tertiary">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading font...</span>
          </div>
        )}
      </div>

      {/* Weight selector (when expanded) */}
      {showWeights && isSelected && font.weights.length > 1 && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs font-medium text-text-secondary mb-2">Font Weight</p>
          <div className="flex flex-wrap gap-1.5">
            {font.weights.map((weight) => (
              <button
                key={weight}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onWeightChange?.(weight);
                }}
                className={`
                  px-2 py-1 text-xs rounded-md transition-colors
                  ${
                    selectedWeight === weight
                      ? 'bg-primary text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                  }
                `}
              >
                {FONT_WEIGHT_LABELS[weight] || weight}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Script Filter Tabs Component
// ---------------------------------------------------------------------------

interface ScriptFilterTabsProps {
  languages: LanguageFontConfig[];
  currentLanguage: string;
  onLanguageChange?: (code: string) => void;
  showAllLanguages?: boolean;
}

const ScriptFilterTabs: React.FC<ScriptFilterTabsProps> = ({
  languages,
  currentLanguage,
  onLanguageChange,
  showAllLanguages = false,
}) => {
  if (!showAllLanguages || !onLanguageChange) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border">
      {languages.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => onLanguageChange(lang.code)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
            ${
              currentLanguage === lang.code
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary'
            }
          `}
        >
          <span className="text-base">{lang.nativeName}</span>
          <span className="text-xs opacity-75">({lang.name})</span>
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live Preview Panel Component
// ---------------------------------------------------------------------------

interface LivePreviewPanelProps {
  font: FontOption | null;
  languageCode: string;
  weight: number;
  customText?: string;
}

const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  font,
  languageCode,
  weight,
  customText,
}) => {
  const [fontLoaded, setFontLoaded] = useState(false);
  const previewSamples = REGIONAL_PREVIEW_SAMPLES[languageCode] || REGIONAL_PREVIEW_SAMPLES.en;

  useEffect(() => {
    if (!font) return;

    // Check if font is already loaded
    if (document.fonts.check(`1em ${font.family.replace(/'/g, '')}`)) {
      setFontLoaded(true);
      return;
    }

    const link = document.createElement('link');
    link.href = font.googleFontsUrl;
    link.rel = 'stylesheet';
    link.onload = () => setFontLoaded(true);
    document.head.appendChild(link);

    return () => {
      // Keep font for reuse
    };
  }, [font]);

  if (!font) {
    return (
      <div className="p-6 bg-surface-hover/50 rounded-xl border border-border text-center">
        <Eye className="w-8 h-8 mx-auto mb-2 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">Select a font to see preview</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-surface to-surface-hover rounded-xl border border-border">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Eye className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-text-primary">Live Preview</span>
        <span className="text-xs text-text-tertiary ml-auto">{font.name}</span>
      </div>

      {fontLoaded ? (
        <div className="space-y-4">
          {/* Auspicious header */}
          <p
            className="text-center text-sm text-text-tertiary"
            style={{ fontFamily: font.family, fontWeight: weight }}
          >
            {previewSamples.auspicious}
          </p>

          {/* Main heading */}
          <h2
            className="text-center text-3xl text-text-primary"
            style={{
              fontFamily: font.family,
              fontWeight: Math.min(weight + 200, 900),
            }}
          >
            {customText || previewSamples.heading}
          </h2>

          {/* Body text */}
          <p
            className="text-center text-lg text-text-secondary"
            style={{ fontFamily: font.family, fontWeight: weight }}
          >
            {previewSamples.body}
          </p>

          {/* Sample numbers and date */}
          <div
            className="text-center text-sm text-text-tertiary pt-2"
            style={{ fontFamily: font.family, fontWeight: weight }}
          >
            <span>15 • 02 • 2025</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const RegionalFontSelector: React.FC<RegionalFontSelectorProps> = ({
  languageCode,
  selectedFont,
  selectedWeight = 400,
  onFontChange,
  customPreviewText,
  showWeightSelector = true,
  compact = false,
  label = 'Regional Font',
  helperText,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [localWeight, setLocalWeight] = useState(selectedWeight);

  // Get language configuration
  const languageConfig = useMemo(() => {
    return INDIAN_LANGUAGE_FONTS.find((lang) => lang.code === languageCode);
  }, [languageCode]);

  // Filter fonts based on category
  const availableFonts = useMemo(() => {
    let fonts = languageConfig?.fonts || [];
    if (categoryFilter) {
      fonts = fonts.filter((f) => f.category === categoryFilter);
    }
    return fonts;
  }, [languageConfig, categoryFilter]);

  // Get currently selected font info
  const selectedFontInfo = useMemo(() => {
    const font = languageConfig?.fonts.find((f) => f.family === selectedFont);
    return font || languageConfig?.fonts[0] || null;
  }, [selectedFont, languageConfig]);

  // Handle font selection
  const handleFontSelect = useCallback(
    (font: FontOption) => {
      onFontChange(font.family, font.name, localWeight);
      if (!showWeightSelector) {
        setIsOpen(false);
      }
    },
    [onFontChange, localWeight, showWeightSelector]
  );

  // Handle weight change
  const handleWeightChange = useCallback(
    (weight: number) => {
      setLocalWeight(weight);
      if (selectedFontInfo) {
        onFontChange(selectedFontInfo.family, selectedFontInfo.name, weight);
      }
    },
    [selectedFontInfo, onFontChange]
  );

  // Get preview samples for the current language
  const previewSamples = REGIONAL_PREVIEW_SAMPLES[languageCode] || REGIONAL_PREVIEW_SAMPLES.en;

  // Compact display for inline usage
  if (compact) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className={`
            inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border
            bg-surface text-sm transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:bg-surface-hover'}
          `}
        >
          <Languages className="w-4 h-4 text-primary" />
          <span
            className="font-medium"
            style={{
              fontFamily: selectedFontInfo?.family || 'inherit',
            }}
          >
            {languageConfig?.nativeName || languageCode}
          </span>
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        </button>

        {/* Modal for compact mode */}
        <AppModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={`Select Font for ${languageConfig?.nativeName || languageCode}`}
          size="lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto">
            {availableFonts.map((font) => (
              <FontPreviewCard
                key={font.name}
                font={font}
                isSelected={selectedFont === font.family}
                onSelect={() => handleFontSelect(font)}
                languageCode={languageCode}
                customPreviewText={customPreviewText}
                selectedWeight={localWeight}
                onWeightChange={handleWeightChange}
                showWeights={showWeightSelector}
              />
            ))}
          </div>
        </AppModal>
      </div>
    );
  }

  // Full display
  return (
    <div className={className}>
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-text-primary">{label}</label>
        {languageConfig && (
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <Globe className="w-3.5 h-3.5" />
            {languageConfig.nativeName} ({languageConfig.script})
          </span>
        )}
      </div>

      {/* Helper text */}
      {helperText && (
        <p className="text-xs text-text-tertiary mb-3">{helperText}</p>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-4 border border-border rounded-xl
          bg-surface transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:bg-surface-hover hover:shadow-sm'}
          focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none
        `}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Type className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">
              {selectedFontInfo?.name || 'Select a font'}
            </p>
            <p
              className="text-base text-text-secondary mt-0.5"
              style={{
                fontFamily: selectedFontInfo?.family || 'inherit',
                fontWeight: localWeight,
              }}
            >
              {customPreviewText || previewSamples.heading}
            </p>
          </div>
        </div>
        <ChevronDown className="w-5 h-5 text-text-tertiary" />
      </button>

      {/* Selected font preview */}
      {selectedFontInfo && (
        <div className="mt-3 p-4 bg-surface-hover/50 rounded-xl border border-border">
          <style>
            {`@import url('${selectedFontInfo.googleFontsUrl}');`}
          </style>
          <div className="space-y-2">
            <p
              className="text-center text-xs text-text-tertiary"
              style={{ fontFamily: selectedFontInfo.family, fontWeight: localWeight }}
            >
              {previewSamples.auspicious}
            </p>
            <p
              className="text-center text-2xl text-text-primary"
              style={{
                fontFamily: selectedFontInfo.family,
                fontWeight: Math.min(localWeight + 200, 900),
              }}
            >
              {customPreviewText || previewSamples.heading}
            </p>
            <p
              className="text-center text-base text-text-secondary"
              style={{ fontFamily: selectedFontInfo.family, fontWeight: localWeight }}
            >
              {previewSamples.body}
            </p>
          </div>
        </div>
      )}

      {/* Font selection modal */}
      <AppModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Select Regional Font - ${languageConfig?.nativeName || languageCode}`}
        size="xl"
      >
        <div className="space-y-6">
          {/* Script info header */}
          <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Languages className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                {languageConfig?.nativeName} Fonts
              </p>
              <p className="text-xs text-text-tertiary">
                Script: {languageConfig?.script} | Direction: {languageConfig?.direction === 'rtl' ? 'Right to Left' : 'Left to Right'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-tertiary">{availableFonts.length} fonts available</p>
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="flex flex-wrap gap-2 p-1 bg-surface-hover rounded-lg">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`
                flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all
                ${
                  categoryFilter === null
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }
              `}
            >
              All Fonts
            </button>
            {Object.entries(FONT_CATEGORY_LABELS).map(([key, labelText]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`
                  flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all
                  ${
                    categoryFilter === key
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }
                `}
              >
                {labelText}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Font grid */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-2">
              {availableFonts.map((font) => (
                <FontPreviewCard
                  key={font.name}
                  font={font}
                  isSelected={selectedFont === font.family}
                  onSelect={() => handleFontSelect(font)}
                  languageCode={languageCode}
                  customPreviewText={customPreviewText}
                  selectedWeight={localWeight}
                  onWeightChange={handleWeightChange}
                  showWeights={showWeightSelector && selectedFont === font.family}
                />
              ))}

              {availableFonts.length === 0 && (
                <div className="col-span-2 flex flex-col items-center justify-center py-12 text-text-tertiary">
                  <Type className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">No fonts available for this category</p>
                </div>
              )}
            </div>

            {/* Live preview panel */}
            <div className="hidden lg:block">
              <LivePreviewPanel
                font={selectedFontInfo}
                languageCode={languageCode}
                weight={localWeight}
                customText={customPreviewText}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-text-tertiary">
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              Fonts powered by Google Fonts
            </div>
            <AppButton
              variant="primary"
              onClick={() => setIsOpen(false)}
            >
              Done
            </AppButton>
          </div>
        </div>
      </AppModal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default RegionalFontSelector;

// Re-export types for consumers
export type { FontOption, LanguageFontConfig };
