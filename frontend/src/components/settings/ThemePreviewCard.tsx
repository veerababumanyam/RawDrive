/**
 * ThemePreviewCard Component
 *
 * Displays a comprehensive preview of a theme including:
 * - Typography (heading/body fonts)
 * - Spacing style (compact/normal/spacious)
 * - Layout style (card/full-bleed/sidebar)
 * - Visual effects (glassmorphism, shadows, radius)
 * - Color palette
 */

import type { Theme } from '../../types/profileEditor';
import type { BackgroundTheme } from '../../types/personalProfile';

interface ThemePreviewCardProps {
  theme: Theme;
  isSelected: boolean;
  onSelect: (themeId: string) => void;
}

export function ThemePreviewCard({ theme, isSelected, onSelect }: ThemePreviewCardProps) {
  const primaryColor = theme.base_colors.primary;
  const accentColor = theme.base_colors.accent;
  const neutralColors = theme.base_colors.neutral.slice(0, 3);

  const spacing = theme.layout_config.spacing;
  const heroStyle = theme.layout_config.hero_style as string;
  const sectionLayout = theme.layout_config.section_layout;

  const headingFont = theme.default_typography.heading_font.family;
  const bodyFont = theme.default_typography.body_font.family;

  // Map spacing to padding values
  const spacingMap = {
    compact: 'p-2',
    normal: 'p-3',
    spacious: 'p-4',
  };

  // Map hero style to visual representation
  const heroStyleMap = {
    card: 'rounded-lg border-2',
    'full-bleed': 'rounded-none',
    sidebar: 'flex gap-2',
  };

  // Get fonts for display
  const fontDisplay = {
    heading: `${headingFont} font-bold`,
    body: `${bodyFont}`,
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(theme.theme_id)}
      className={`group relative overflow-hidden rounded-xl border-2 transition-all h-full flex flex-col ${
        isSelected
          ? 'border-primary shadow-lg shadow-primary/20'
          : 'border-border hover:border-primary/50'
      }`}
      title={theme.description}
    >
      {/* Hero Preview - Shows layout and color style */}
      <div
        className={`flex-1 flex flex-col ${spacingMap[spacing]} overflow-hidden transition-all`}
        style={{
          background: `linear-gradient(135deg, ${primaryColor}15 0%, ${accentColor}15 100%)`,
          borderBottom: `2px solid ${accentColor}20`,
        }}
      >
        {/* Hero Style Visualization */}
        {heroStyle === 'card' && (
          <div
            className="rounded-lg border-2 p-2 flex-1 flex flex-col justify-between"
            style={{
              borderColor: `${primaryColor}40`,
              backgroundColor: `${primaryColor}08`,
            }}
          >
            <div
              className="h-8 rounded w-3/4"
              style={{ backgroundColor: primaryColor, opacity: 0.6 }}
            />
            <div className="space-y-1">
              <div
                className="h-2 rounded w-full"
                style={{ backgroundColor: accentColor, opacity: 0.4 }}
              />
              <div
                className="h-2 rounded w-5/6"
                style={{ backgroundColor: accentColor, opacity: 0.3 }}
              />
            </div>
          </div>
        )}

        {heroStyle === 'full-bleed' && (
          <div
            className="flex-1 flex items-center justify-center rounded-sm"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
            }}
          >
            <div className="text-white/80 text-xs font-semibold">Full Bleed</div>
          </div>
        )}

        {heroStyle === 'sidebar' && (
          <div className="flex gap-2 flex-1">
            <div
              className="w-2 rounded"
              style={{ backgroundColor: primaryColor, opacity: 0.7 }}
            />
            <div className="flex-1 flex flex-col justify-between py-1">
              <div
                className="h-1 rounded w-4/5"
                style={{ backgroundColor: accentColor, opacity: 0.5 }}
              />
              <div
                className="h-1 rounded w-3/5"
                style={{ backgroundColor: accentColor, opacity: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Typography & Effects */}
      <div className="bg-surface p-3 border-t border-border/50 space-y-2">
        {/* Typography Display */}
        <div className="space-y-1">
          <div
            className={`text-xs font-bold truncate ${fontDisplay.heading}`}
            style={{ color: primaryColor }}
          >
            {headingFont}
          </div>
          <div className="text-xs text-text-secondary truncate" style={{ fontFamily: bodyFont }}>
            {bodyFont}
          </div>
        </div>

        {/* Layout & Spacing Config */}
        <div className="flex flex-wrap gap-1">
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded capitalize">
            {spacing}
          </span>
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded capitalize">
            {sectionLayout.replace('-', ' ')}
          </span>
        </div>

        {/* Color Swatches */}
        <div className="flex gap-1 pt-1">
          {[primaryColor, accentColor, ...neutralColors].map((color, idx) => (
            <div
              key={idx}
              className="flex-1 h-4 rounded-sm shadow-sm border border-black/10"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Theme Info */}
        <div className="pt-1 border-t border-border/30">
          <div className="font-medium text-sm text-text-primary truncate">{theme.name}</div>
          <div className="text-xs text-text-secondary capitalize">{theme.category}</div>
          {theme.is_premium && (
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-1">
              ⭐ Premium
            </div>
          )}
        </div>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <>
          <div className="absolute inset-0 rounded-xl border-2 border-primary pointer-events-none" />
          <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </>
      )}
    </button>
  );
}
