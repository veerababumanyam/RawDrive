/**
 * PhotoLayoutSelector: Choose layout for invitation photos
 *
 * Allows users to select how their photos are arranged
 * in the invitation (grid, carousel, hero, collage, etc.)
 *
 * Feature: 016-save-the-date Phase 5
 */

import React, { useState } from 'react';
import {
  LayoutGrid,
  Square,
  RectangleHorizontal,
  Layers,
  GalleryHorizontal,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';

export type PhotoLayout =
  | 'single_hero'
  | 'grid_2x2'
  | 'grid_3x3'
  | 'carousel'
  | 'masonry'
  | 'collage'
  | 'side_by_side'
  | 'stacked';

interface LayoutOption {
  id: PhotoLayout;
  label: string;
  description: string;
  icon: React.ReactNode;
  preview: React.ReactNode;
  minPhotos: number;
  maxPhotos: number;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'single_hero',
    label: 'Single Hero',
    description: 'One large photo as the centerpiece',
    icon: <RectangleHorizontal className="w-5 h-5" />,
    preview: (
      <div className="w-full aspect-video bg-primary/20 rounded" />
    ),
    minPhotos: 1,
    maxPhotos: 1,
  },
  {
    id: 'grid_2x2',
    label: '2×2 Grid',
    description: 'Four photos in a square grid',
    icon: <LayoutGrid className="w-5 h-5" />,
    preview: (
      <div className="grid grid-cols-2 gap-1 aspect-square">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-primary/20 rounded" />
        ))}
      </div>
    ),
    minPhotos: 4,
    maxPhotos: 4,
  },
  {
    id: 'grid_3x3',
    label: '3×3 Grid',
    description: 'Nine photos in a larger grid',
    icon: <LayoutGrid className="w-5 h-5" />,
    preview: (
      <div className="grid grid-cols-3 gap-0.5 aspect-square">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="bg-primary/20 rounded" />
        ))}
      </div>
    ),
    minPhotos: 9,
    maxPhotos: 9,
  },
  {
    id: 'carousel',
    label: 'Carousel',
    description: 'Swipeable photo slideshow',
    icon: <GalleryHorizontal className="w-5 h-5" />,
    preview: (
      <div className="flex gap-1 overflow-hidden aspect-video">
        <div className="flex-shrink-0 w-3/4 bg-primary/20 rounded" />
        <div className="flex-shrink-0 w-1/4 bg-primary/10 rounded" />
      </div>
    ),
    minPhotos: 2,
    maxPhotos: 10,
  },
  {
    id: 'masonry',
    label: 'Masonry',
    description: 'Pinterest-style varied sizes',
    icon: <Layers className="w-5 h-5" />,
    preview: (
      <div className="grid grid-cols-2 gap-1 h-20">
        <div className="bg-primary/20 rounded h-full" />
        <div className="grid grid-rows-2 gap-1">
          <div className="bg-primary/15 rounded" />
          <div className="bg-primary/25 rounded" />
        </div>
      </div>
    ),
    minPhotos: 3,
    maxPhotos: 6,
  },
  {
    id: 'collage',
    label: 'Collage',
    description: 'Artistic overlapping photos',
    icon: <ImageIcon className="w-5 h-5" />,
    preview: (
      <div className="relative aspect-video">
        <div className="absolute top-0 left-0 w-2/3 h-2/3 bg-primary/20 rounded transform rotate-[-3deg]" />
        <div className="absolute bottom-0 right-0 w-2/3 h-2/3 bg-primary/30 rounded transform rotate-[3deg]" />
      </div>
    ),
    minPhotos: 2,
    maxPhotos: 5,
  },
  {
    id: 'side_by_side',
    label: 'Side by Side',
    description: 'Two photos next to each other',
    icon: <GalleryHorizontal className="w-5 h-5" />,
    preview: (
      <div className="flex gap-1 aspect-video">
        <div className="flex-1 bg-primary/20 rounded" />
        <div className="flex-1 bg-primary/25 rounded" />
      </div>
    ),
    minPhotos: 2,
    maxPhotos: 2,
  },
  {
    id: 'stacked',
    label: 'Stacked',
    description: 'Photos stacked vertically',
    icon: <Layers className="w-5 h-5" />,
    preview: (
      <div className="flex flex-col gap-1 h-20">
        <div className="flex-1 bg-primary/20 rounded" />
        <div className="flex-1 bg-primary/25 rounded" />
        <div className="flex-1 bg-primary/15 rounded" />
      </div>
    ),
    minPhotos: 2,
    maxPhotos: 4,
  },
];

interface PhotoLayoutSelectorProps {
  value: PhotoLayout;
  onChange: (layout: PhotoLayout) => void;
  photoCount?: number;
  disabled?: boolean;
}

export const PhotoLayoutSelector: React.FC<PhotoLayoutSelectorProps> = ({
  value,
  onChange,
  photoCount = 0,
  disabled = false,
}) => {
  const [hoveredLayout, setHoveredLayout] = useState<PhotoLayout | null>(null);

  const isLayoutAvailable = (layout: LayoutOption): boolean => {
    if (photoCount === 0) return true;
    return photoCount >= layout.minPhotos && photoCount <= layout.maxPhotos;
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-text-primary">
        Photo Layout
      </label>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {LAYOUT_OPTIONS.map((layout) => {
          const available = isLayoutAvailable(layout);
          const isSelected = value === layout.id;
          const isHovered = hoveredLayout === layout.id;

          return (
            <button
              key={layout.id}
              onClick={() => available && !disabled && onChange(layout.id)}
              onMouseEnter={() => setHoveredLayout(layout.id)}
              onMouseLeave={() => setHoveredLayout(null)}
              disabled={disabled || !available}
              className={`
                relative p-3 rounded-lg border-2 transition-all text-left
                ${isSelected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : available
                    ? 'border-border hover:border-primary/50'
                    : 'border-border/50 opacity-50 cursor-not-allowed'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              aria-pressed={isSelected}
              aria-label={`${layout.label}: ${layout.description}`}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Preview */}
              <div className="mb-2 p-2 bg-surface-alt rounded">
                {layout.preview}
              </div>

              {/* Label */}
              <div className="font-medium text-sm text-text-primary">
                {layout.label}
              </div>

              {/* Photo count range */}
              <div className="text-xs text-text-tertiary mt-0.5">
                {layout.minPhotos === layout.maxPhotos
                  ? `${layout.minPhotos} photo${layout.minPhotos !== 1 ? 's' : ''}`
                  : `${layout.minPhotos}-${layout.maxPhotos} photos`
                }
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected layout description */}
      {value && (
        <div className="p-3 bg-surface-alt rounded-lg">
          <div className="text-sm text-text-secondary">
            {LAYOUT_OPTIONS.find((l) => l.id === value)?.description}
          </div>
          {photoCount > 0 && (
            <div className="text-xs text-text-tertiary mt-1">
              You have {photoCount} photo{photoCount !== 1 ? 's' : ''} uploaded
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Get CSS grid/flex classes for a photo layout
 */
export const getLayoutClasses = (layout: PhotoLayout): string => {
  switch (layout) {
    case 'single_hero':
      return 'w-full aspect-video';
    case 'grid_2x2':
      return 'grid grid-cols-2 gap-2';
    case 'grid_3x3':
      return 'grid grid-cols-3 gap-2';
    case 'carousel':
      return 'flex gap-4 overflow-x-auto snap-x snap-mandatory';
    case 'masonry':
      return 'columns-2 gap-4 space-y-4';
    case 'collage':
      return 'relative grid grid-cols-2 grid-rows-2 gap-2';
    case 'side_by_side':
      return 'flex gap-4';
    case 'stacked':
      return 'flex flex-col gap-4';
    default:
      return '';
  }
};

/**
 * Get item classes for photos within a layout
 */
export const getLayoutItemClasses = (
  layout: PhotoLayout,
  index: number,
  total: number
): string => {
  switch (layout) {
    case 'single_hero':
      return 'w-full h-full object-cover rounded-lg';
    case 'grid_2x2':
    case 'grid_3x3':
      return 'aspect-square object-cover rounded-lg';
    case 'carousel':
      return 'flex-shrink-0 w-4/5 snap-center object-cover rounded-lg';
    case 'masonry':
      return 'w-full object-cover rounded-lg break-inside-avoid';
    case 'collage':
      if (index === 0) return 'col-span-2 row-span-1 object-cover rounded-lg';
      return 'object-cover rounded-lg';
    case 'side_by_side':
      return 'flex-1 object-cover rounded-lg';
    case 'stacked':
      return 'w-full aspect-video object-cover rounded-lg';
    default:
      return '';
  }
};

export default PhotoLayoutSelector;
