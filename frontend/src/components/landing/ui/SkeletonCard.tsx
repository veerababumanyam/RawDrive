import React from 'react';

/* =============================================================================
   SkeletonCard Component

   Loading state skeleton for gallery cards and other content.
   Provides better perceived performance during data loading.
   ============================================================================= */

interface SkeletonCardProps {
  /** Visual variant for different contexts */
  variant?: 'gallery' | 'feature' | 'testimonial' | 'pricing';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading card for improved perceived performance.
 * Matches the visual style of actual content cards.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  variant = 'gallery',
  className = '',
}) => {
  const baseClasses = 'animate-pulse rounded-2xl bg-white/5 border border-white/10';

  if (variant === 'gallery') {
    return (
      <div className={`${baseClasses} overflow-hidden ${className}`} aria-hidden="true">
        {/* Image placeholder */}
        <div className="aspect-[4/3] bg-white/5" />
        {/* Content placeholder */}
        <div className="p-4 space-y-3">
          <div className="h-4 bg-white/5 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (variant === 'feature') {
    return (
      <div className={`${baseClasses} p-6 ${className}`} aria-hidden="true">
        {/* Icon placeholder */}
        <div className="w-14 h-14 rounded-xl bg-white/5 mb-4" />
        {/* Title placeholder */}
        <div className="h-5 bg-white/5 rounded w-2/3 mb-3" />
        {/* Description placeholders */}
        <div className="space-y-2">
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-5/6" />
          <div className="h-3 bg-white/5 rounded w-4/6" />
        </div>
      </div>
    );
  }

  if (variant === 'testimonial') {
    return (
      <div className={`${baseClasses} p-6 ${className}`} aria-hidden="true">
        {/* Stars placeholder */}
        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-4 h-4 rounded bg-white/5" />
          ))}
        </div>
        {/* Quote placeholders */}
        <div className="space-y-2 mb-6">
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-5/6" />
          <div className="h-3 bg-white/5 rounded w-4/5" />
        </div>
        {/* Author placeholder */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/5" />
          <div className="space-y-2">
            <div className="h-4 bg-white/5 rounded w-24" />
            <div className="h-3 bg-white/5 rounded w-20" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'pricing') {
    return (
      <div className={`${baseClasses} p-8 text-center ${className}`} aria-hidden="true">
        {/* Plan name placeholder */}
        <div className="h-6 bg-white/5 rounded w-24 mx-auto mb-4" />
        {/* Price placeholder */}
        <div className="h-12 bg-white/5 rounded w-32 mx-auto mb-6" />
        {/* Features placeholders */}
        <div className="space-y-3 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-3 bg-white/5 rounded w-full" />
          ))}
        </div>
        {/* Button placeholder */}
        <div className="h-12 bg-white/5 rounded-lg w-full" />
      </div>
    );
  }

  // Default fallback
  return (
    <div className={`${baseClasses} p-6 ${className}`} aria-hidden="true">
      <div className="h-48 bg-white/5 rounded-lg mb-4" />
      <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
      <div className="h-4 bg-white/5 rounded w-1/2" />
    </div>
  );
};

/**
 * Grid of skeleton cards for loading states
 */
export const SkeletonGrid: React.FC<{
  count?: number;
  variant?: SkeletonCardProps['variant'];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}> = ({ count = 3, variant = 'gallery', columns = 3, className = '' }) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div
      className={`grid ${gridCols[columns]} gap-6 ${className}`}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
};

/**
 * Inline skeleton for text content
 */
export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`h-4 bg-white/5 rounded animate-pulse ${
          i === lines - 1 ? 'w-2/3' : 'w-full'
        }`}
      />
    ))}
  </div>
);

SkeletonCard.displayName = 'SkeletonCard';
SkeletonGrid.displayName = 'SkeletonGrid';
SkeletonText.displayName = 'SkeletonText';

export default SkeletonCard;
