import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Check, ZoomIn, Heart, Download, MoreVertical } from 'lucide-react';

/* =============================================================================
   PhotoGrid Component

   A responsive photo grid optimized for photography applications with
   masonry layout, selection, lazy loading, and hover interactions.
   ============================================================================= */

export interface Photo {
  id: string;
  src: string;
  thumbnailSrc?: string;
  alt: string;
  width: number;
  height: number;
  title?: string;
  metadata?: {
    dateTaken?: string;
    camera?: string;
    location?: string;
    isFavorite?: boolean;
  };
}

export interface PhotoGridProps {
  /** Array of photos to display */
  photos: Photo[];
  /** Grid layout type */
  layout?: 'grid' | 'masonry' | 'justified';
  /** Number of columns (for grid layout) */
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  /** Gap between photos */
  gap?: 'sm' | 'md' | 'lg';
  /** Enable photo selection */
  selectable?: boolean;
  /** Selected photo IDs */
  selectedIds?: Set<string>;
  /** Selection change handler */
  onSelectionChange?: (ids: Set<string>) => void;
  /** Photo click handler */
  onPhotoClick?: (photo: Photo, index: number) => void;
  /** Photo double click handler */
  onPhotoDoubleClick?: (photo: Photo, index: number) => void;
  /** Show photo info on hover */
  showInfo?: boolean;
  /** Show action buttons on hover */
  showActions?: boolean;
  /** Custom action buttons */
  actions?: (photo: Photo) => React.ReactNode;
  /** Loading state */
  isLoading?: boolean;
  /** Photo aspect ratio (for grid layout) */
  aspectRatio?: 'square' | '4/3' | '3/2' | '16/9' | 'auto';
  /** Enable lazy loading */
  lazyLoad?: boolean;
  className?: string;
}

const gapStyles = {
  sm: 'gap-1',
  md: 'gap-2',
  lg: 'gap-4',
};

const aspectRatioStyles = {
  square: 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '16/9': 'aspect-video',
  auto: '',
};

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  layout: _layout = 'grid',
  columns = { sm: 2, md: 3, lg: 4, xl: 5 },
  gap = 'md',
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onPhotoClick,
  onPhotoDoubleClick,
  showInfo = false,
  showActions = true,
  actions,
  isLoading = false,
  aspectRatio = 'square',
  lazyLoad = true,
  className = '',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Generate responsive column classes
  const getColumnClasses = () => {
    if (typeof columns === 'number') {
      return `grid-cols-${columns}`;
    }
    const { sm = 2, md = 3, lg = 4, xl = 5 } = columns;
    return `grid-cols-${sm} sm:grid-cols-${sm} md:grid-cols-${md} lg:grid-cols-${lg} xl:grid-cols-${xl}`;
  };

  const handleSelect = useCallback(
    (photoId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const newSelection = new Set(selectedIds);
      if (newSelection.has(photoId)) {
        newSelection.delete(photoId);
      } else {
        newSelection.add(photoId);
      }
      onSelectionChange?.(newSelection);
    },
    [selectedIds, onSelectionChange]
  );

  const handleClick = useCallback(
    (photo: Photo, index: number, e: React.MouseEvent) => {
      if (selectable && (e.ctrlKey || e.metaKey)) {
        handleSelect(photo.id, e);
      } else {
        onPhotoClick?.(photo, index);
      }
    },
    [selectable, handleSelect, onPhotoClick]
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`grid ${getColumnClasses()} ${gapStyles[gap]} ${className}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`
              ${aspectRatioStyles[aspectRatio]}
              bg-neutral-200 dark:bg-neutral-700
              rounded-lg
              animate-pulse
            `}
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (photos.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <div className="w-16 h-16 mb-4 rounded-full bg-background-alt flex items-center justify-center">
          <ZoomIn size={24} className="text-text-tertiary" />
        </div>
        <p className="text-text-secondary">No photos to display</p>
      </div>
    );
  }

  return (
    <div
      className={`
        grid
        ${getColumnClasses()}
        ${gapStyles[gap]}
        ${className}
      `}
      role="grid"
      aria-label="Photo gallery"
    >
      {photos.map((photo, index) => {
        const isSelected = selectedIds.has(photo.id);
        const isHovered = hoveredId === photo.id;

        return (
          <PhotoCard
            key={photo.id}
            photo={photo}
            index={index}
            isSelected={isSelected}
            isHovered={isHovered}
            selectable={selectable}
            showInfo={showInfo}
            showActions={showActions}
            actions={actions}
            aspectRatio={aspectRatio}
            lazyLoad={lazyLoad}
            onSelect={handleSelect}
            onClick={handleClick}
            onDoubleClick={onPhotoDoubleClick}
            onMouseEnter={() => setHoveredId(photo.id)}
            onMouseLeave={() => setHoveredId(null)}
          />
        );
      })}
    </div>
  );
};

/* =============================================================================
   PhotoCard Component
   ============================================================================= */

interface PhotoCardProps {
  photo: Photo;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  selectable: boolean;
  showInfo: boolean;
  showActions: boolean;
  actions?: (photo: Photo) => React.ReactNode;
  aspectRatio: string;
  lazyLoad: boolean;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onClick: (photo: Photo, index: number, e: React.MouseEvent) => void;
  onDoubleClick?: (photo: Photo, index: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({
  photo,
  index,
  isSelected,
  isHovered,
  selectable,
  showInfo,
  showActions,
  actions,
  aspectRatio,
  lazyLoad,
  onSelect,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!lazyLoad || !imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              observer.unobserve(img);
            }
          }
        });
      },
      { rootMargin: '100px' }
    );

    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [lazyLoad]);

  const imageSrc = photo.thumbnailSrc || photo.src;

  return (
    <div
      className={`
        group relative
        ${aspectRatioStyles[aspectRatio as keyof typeof aspectRatioStyles] || ''}
        rounded-lg
        overflow-hidden
        cursor-pointer
        bg-neutral-100 dark:bg-neutral-800
        transition-all duration-200 ease-out
        ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
        hover:shadow-lg
      `}
      role="gridcell"
      tabIndex={0}
      onClick={(e) => onClick(photo, index, e)}
      onDoubleClick={() => onDoubleClick?.(photo, index)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(photo, index, e as unknown as React.MouseEvent);
        if (e.key === ' ' && selectable) {
          e.preventDefault();
          onSelect(photo.id);
        }
      }}
      aria-selected={isSelected}
    >
      {/* Image */}
      <img
        ref={imgRef}
        src={lazyLoad ? undefined : imageSrc}
        data-src={lazyLoad ? imageSrc : undefined}
        alt={photo.alt}
        className={`
          w-full h-full object-cover
          transition-all duration-300
          ${imageLoaded ? 'opacity-100' : 'opacity-0'}
          group-hover:scale-105
        `}
        loading={lazyLoad ? 'lazy' : undefined}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />

      {/* Loading placeholder */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
      )}

      {/* Error placeholder */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-200 dark:bg-neutral-700">
          <span className="text-text-tertiary text-sm">Failed to load</span>
        </div>
      )}

      {/* Selection checkbox */}
      {selectable && (
        <div
          className={`
            absolute top-2 left-2 z-10
            transition-opacity duration-150
            ${isSelected || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`
              w-6 h-6
              rounded-full
              flex items-center justify-center
              transition-all duration-150
              ${isSelected
                ? 'bg-primary text-white'
                : 'bg-black/50 text-white hover:bg-black/70'}
            `}
            onClick={(e) => onSelect(photo.id, e)}
          >
            {isSelected && <Check size={14} strokeWidth={3} />}
          </div>
        </div>
      )}

      {/* Hover overlay with actions */}
      {showActions && (
        <div
          className={`
            absolute inset-0
            bg-gradient-to-t from-black/60 via-transparent to-transparent
            transition-opacity duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0'}
            flex flex-col justify-end p-3
          `}
        >
          {/* Default actions */}
          {!actions && (
            <div className="flex items-center gap-2">
              <button
                className="
                  p-1.5 rounded-full
                  bg-white/20 hover:bg-white/30
                  text-white
                  transition-colors
                "
                onClick={(e) => {
                  e.stopPropagation();
                  // Favorite action
                }}
                aria-label="Add to favorites"
              >
                <Heart size={16} />
              </button>
              <button
                className="
                  p-1.5 rounded-full
                  bg-white/20 hover:bg-white/30
                  text-white
                  transition-colors
                "
                onClick={(e) => {
                  e.stopPropagation();
                  // Download action
                }}
                aria-label="Download"
              >
                <Download size={16} />
              </button>
              <button
                className="
                  p-1.5 rounded-full
                  bg-white/20 hover:bg-white/30
                  text-white
                  transition-colors
                  ml-auto
                "
                onClick={(e) => {
                  e.stopPropagation();
                  // More actions
                }}
                aria-label="More options"
              >
                <MoreVertical size={16} />
              </button>
            </div>
          )}

          {/* Custom actions */}
          {actions && actions(photo)}
        </div>
      )}

      {/* Photo info */}
      {showInfo && photo.title && (
        <div
          className={`
            absolute bottom-0 left-0 right-0
            p-3
            bg-gradient-to-t from-black/70 to-transparent
            transition-opacity duration-200
            ${isHovered && !showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
        >
          <p className="text-white text-sm font-medium truncate">{photo.title}</p>
          {photo.metadata?.dateTaken && (
            <p className="text-white/70 text-xs">{photo.metadata.dateTaken}</p>
          )}
        </div>
      )}

      {/* Favorite indicator */}
      {photo.metadata?.isFavorite && (
        <div className="absolute top-2 right-2">
          <Heart size={16} className="text-error fill-error" />
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   Masonry Grid Layout Component (Alternative)
   ============================================================================= */

export interface MasonryGridProps extends Omit<PhotoGridProps, 'layout'> {
  /** Column width in pixels (for calculating columns) */
  columnWidth?: number;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({
  photos,
  columnWidth = 280,
  gap = 'md',
  className = '',
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(4);

  useEffect(() => {
    const updateColumns = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const gapSize = gap === 'sm' ? 4 : gap === 'md' ? 8 : 16;
        const cols = Math.max(1, Math.floor((containerWidth + gapSize) / (columnWidth + gapSize)));
        setColumnCount(cols);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [columnWidth, gap]);

  // Distribute photos into columns
  const columnPhotos: Photo[][] = Array.from({ length: columnCount }, () => []);
  photos.forEach((photo, index) => {
    columnPhotos[index % columnCount].push(photo);
  });

  const gapSizeMap = { sm: '0.25rem', md: '0.5rem', lg: '1rem' };

  return (
    <div
      ref={containerRef}
      className={`flex ${className}`}
      style={{ gap: gapSizeMap[gap] }}
    >
      {columnPhotos.map((column, colIndex) => (
        <div
          key={colIndex}
          className="flex-1 flex flex-col"
          style={{ gap: gapSizeMap[gap] }}
        >
          {column.map((photo, index) => {
            const originalIndex = colIndex + index * columnCount;
            return (
              <div
                key={photo.id}
                className="relative rounded-lg overflow-hidden cursor-pointer group"
                style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                onClick={() => props.onPhotoClick?.(photo, originalIndex)}
              >
                <img
                  src={photo.thumbnailSrc || photo.src}
                  alt={photo.alt}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default PhotoGrid;
