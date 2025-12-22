/**
 * Theme Help Tooltip Component
 *
 * Provides contextual help and tooltips for theme customization:
 * - Tooltips for all customization options
 * - Before/after comparison on hover
 * - "Customized" badge for modified themes
 * - Help documentation links
 *
 * Requirements: 8.10, 8.11, 8.13, 8.14
 */

import React, { useState } from 'react';
import {
  HelpCircle,
  Info,
  ExternalLink,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface TooltipContent {
  title: string;
  description: string;
  tip?: string;
  learnMoreUrl?: string;
}

interface ThemeHelpTooltipProps {
  /** Which field this tooltip is for */
  field: keyof typeof TOOLTIP_CONTENT;
  /** Position of the tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Size variant */
  size?: 'sm' | 'md';
}

interface BeforeAfterPreviewProps {
  /** Label for the preview */
  label: string;
  /** Before value (original) */
  before: string;
  /** After value (modified) */
  after: string;
  /** Type of value */
  type: 'color' | 'font' | 'text';
}

interface CustomizedBadgeProps {
  /** Whether the item has been customized */
  isCustomized: boolean;
  /** Compact display mode */
  compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const TOOLTIP_CONTENT: Record<string, TooltipContent> = {
  primary_color: {
    title: 'Primary Color',
    description: 'The main brand color used for buttons, links, and key UI elements.',
    tip: 'Choose a color that represents your brand and has good contrast with white text.',
  },
  secondary_color: {
    title: 'Secondary Color',
    description: 'A supporting color used for secondary buttons and less prominent elements.',
    tip: 'This should complement your primary color while being distinct.',
  },
  accent_color: {
    title: 'Accent Color',
    description: 'Used for highlights, badges, and interactive elements.',
    tip: 'Accent colors work best when they stand out from both primary and secondary.',
  },
  heading_font: {
    title: 'Heading Font',
    description: 'The font family used for all headings and titles.',
    tip: 'Bold, distinctive fonts work well for headings to create visual hierarchy.',
  },
  body_font: {
    title: 'Body Font',
    description: 'The font family used for paragraphs and general text.',
    tip: 'Choose a highly legible font for body text, especially for longer content.',
  },
  spacing: {
    title: 'Spacing',
    description: 'Controls the amount of whitespace between elements.',
    tip: 'Spacious layouts feel more premium, while compact layouts show more content.',
  },
  hero_style: {
    title: 'Hero Style',
    description: 'How the profile header/hero section is displayed.',
    tip: 'Card style is contained, while Full Bleed extends to the edges.',
  },
  section_layout: {
    title: 'Section Layout',
    description: 'How content sections are arranged on the page.',
    tip: 'Single column is cleaner, two-column shows more content above the fold.',
  },
  contrast: {
    title: 'Color Contrast',
    description: 'WCAG 2.1 AA requires a contrast ratio of at least 4.5:1 for normal text.',
    tip: 'Good contrast ensures your content is readable for all users.',
    learnMoreUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
  },
};

// =============================================================================
// Theme Help Tooltip Component
// =============================================================================

export const ThemeHelpTooltip: React.FC<ThemeHelpTooltipProps> = ({
  field,
  position = 'top',
  size = 'sm',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const content = TOOLTIP_CONTENT[field];

  if (!content) return null;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  // Position classes
  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Arrow classes
  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-800',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-800',
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="p-1 rounded-full text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={`Help: ${content.title}`}
      >
        <HelpCircle className={iconSize} />
      </button>

      {/* Tooltip popup */}
      {isOpen && (
        <div
          role="tooltip"
          className={`
            absolute z-50 w-64 p-3 rounded-lg bg-gray-800 text-white shadow-xl
            ${positionClasses[position]}
          `}
        >
          {/* Arrow */}
          <div
            className={`
              absolute w-0 h-0 border-4
              ${arrowClasses[position]}
            `}
          />

          {/* Content */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />
              {content.title}
            </h4>
            <p className="text-xs text-gray-300">{content.description}</p>

            {content.tip && (
              <div className="flex items-start gap-1.5 pt-1 border-t border-gray-700">
                <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-gray-400">{content.tip}</p>
              </div>
            )}

            {content.learnMoreUrl && (
              <a
                href={content.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Learn more
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Before/After Preview Component
// =============================================================================

export const BeforeAfterPreview: React.FC<BeforeAfterPreviewProps> = ({
  label,
  before,
  after,
  type,
}) => {
  const hasChanged = before !== after;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-hover">
      <span className="text-xs text-text-tertiary w-16">{label}</span>

      {/* Before */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-text-tertiary">Before</span>
        {type === 'color' ? (
          <div
            className="w-5 h-5 rounded border border-border"
            style={{ backgroundColor: before }}
          />
        ) : (
          <span className="text-xs font-medium" style={type === 'font' ? { fontFamily: before } : {}}>
            {before}
          </span>
        )}
      </div>

      {/* Arrow */}
      <span className="text-text-tertiary">→</span>

      {/* After */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-text-tertiary">After</span>
        {type === 'color' ? (
          <div
            className={`w-5 h-5 rounded border ${hasChanged ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
            style={{ backgroundColor: after }}
          />
        ) : (
          <span
            className={`text-xs font-medium ${hasChanged ? 'text-primary' : ''}`}
            style={type === 'font' ? { fontFamily: after } : {}}
          >
            {after}
          </span>
        )}
      </div>

      {/* Change indicator */}
      {hasChanged && (
        <CheckCircle2 className="w-3.5 h-3.5 text-success ml-auto" />
      )}
    </div>
  );
};

// =============================================================================
// Customized Badge Component
// =============================================================================

export const CustomizedBadge: React.FC<CustomizedBadgeProps> = ({
  isCustomized,
  compact = false,
}) => {
  if (!isCustomized) return null;

  if (compact) {
    return (
      <span
        className="w-2 h-2 rounded-full bg-accent animate-pulse"
        title="Customized"
        aria-label="This theme has been customized"
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/20 text-accent"
      aria-label="This theme has been customized"
    >
      <AlertCircle className="w-3 h-3" />
      Customized
    </span>
  );
};

// =============================================================================
// Theme Tips Panel Component
// =============================================================================

interface ThemeTipsPanelProps {
  tips?: string[];
  onDismiss?: () => void;
}

export const ThemeTipsPanel: React.FC<ThemeTipsPanelProps> = ({
  tips = [
    'Click on a theme to see it applied instantly in the preview.',
    'Use the Light/Dark toggle to preview how your theme looks in both modes.',
    'Color contrast is checked automatically - look for warnings if colors may be hard to read.',
    'All changes are auto-saved, but you can undo/redo at any time.',
    'Save your customizations as a preset to quickly apply them later.',
  ],
  onDismiss,
}) => {
  const [currentTip, setCurrentTip] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <Lightbulb className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary">
              Tip {currentTip + 1} of {tips.length}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsDismissed(true);
                onDismiss?.();
              }}
              className="text-text-tertiary hover:text-text-secondary text-xs"
            >
              Dismiss
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">{tips[currentTip]}</p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setCurrentTip((prev) => (prev > 0 ? prev - 1 : tips.length - 1))}
              className="text-xs text-text-tertiary hover:text-text-secondary"
              disabled={tips.length <= 1}
            >
              Previous
            </button>
            <div className="flex gap-1">
              {tips.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentTip(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    idx === currentTip ? 'bg-primary' : 'bg-border hover:bg-primary/50'
                  }`}
                  aria-label={`Go to tip ${idx + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCurrentTip((prev) => (prev < tips.length - 1 ? prev + 1 : 0))}
              className="text-xs text-text-tertiary hover:text-text-secondary"
              disabled={tips.length <= 1}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeHelpTooltip;
