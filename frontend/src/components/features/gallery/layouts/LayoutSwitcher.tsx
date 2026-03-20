/**
 * LayoutSwitcher — Toggle between available gallery layout modes.
 *
 * Renders a row of icon buttons (one per layout) with tooltips and
 * accessibility attributes.  Active layout is visually highlighted.
 * Intended to be placed in the gallery header area.
 *
 * @module layouts/LayoutSwitcher
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Grid, Columns, AlignJustify, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { LayoutStyle } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const LAYOUT_META: Record<string, { icon: LucideIcon; label: string }> = {
  grid:      { icon: Grid,         label: 'Grid' },
  masonry:   { icon: Columns,      label: 'Masonry' },
  justified: { icon: AlignJustify, label: 'Justified' },
  mosaic:    { icon: LayoutGrid,   label: 'Mosaic' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LayoutSwitcherProps {
  /** Currently active layout */
  activeLayout: LayoutStyle;
  /** Called when visitor clicks a different layout */
  onLayoutChange: (layout: LayoutStyle) => void;
  /** Subset of layouts to expose (defaults to the 4 implemented layouts) */
  availableLayouts?: LayoutStyle[];
}

// ---------------------------------------------------------------------------
// Default available layouts
// ---------------------------------------------------------------------------

const DEFAULT_LAYOUTS: LayoutStyle[] = ['grid', 'masonry', 'justified', 'mosaic'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LayoutSwitcher: React.FC<LayoutSwitcherProps> = ({
  activeLayout,
  onLayoutChange,
  availableLayouts = DEFAULT_LAYOUTS,
}) => {
  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Gallery layout"
    >
      {availableLayouts.map((layout) => {
        const meta = LAYOUT_META[layout];
        if (!meta) return null;

        const isActive = layout === activeLayout;
        const Icon = meta.icon;

        return (
          <motion.button
            key={layout}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Switch to ${meta.label} layout`}
            title={meta.label}
            className={`
              inline-flex items-center justify-center w-9 h-9 rounded-lg
              border transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
              ${
                isActive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              }
            `}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (!isActive) onLayoutChange(layout);
            }}
          >
            <Icon size={18} />
          </motion.button>
        );
      })}
    </div>
  );
};
