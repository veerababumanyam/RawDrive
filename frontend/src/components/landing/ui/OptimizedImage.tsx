import React, { useState, useRef, useEffect } from 'react';

/* =============================================================================
   OptimizedImage Component

   Performance-optimized image component with:
   - Lazy loading via Intersection Observer
   - Low-quality image placeholder (LQIP) support
   - Responsive srcSet generation
   - WebP format support with fallback
   - Blur-up effect during loading
   - Aspect ratio preservation to prevent CLS
   ============================================================================= */

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  placeholder?: string;
  sizes?: string;
  srcSet?: string;
  aspectRatio?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  placeholder,
  sizes = '100vw',
  srcSet,
  aspectRatio,
  onLoad,
  onError,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || !imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px 0px', // Start loading 200px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Calculate aspect ratio style for CLS prevention
  const aspectRatioStyle = aspectRatio
    ? { aspectRatio }
    : width && height
      ? { aspectRatio: `${width} / ${height}` }
      : undefined;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={aspectRatioStyle}
    >
      {/* Placeholder blur-up effect */}
      {placeholder && !isLoaded && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-lg scale-105 transition-opacity duration-300"
          style={{ opacity: isLoaded ? 0 : 1 }}
        />
      )}

      {/* Main image */}
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        srcSet={isInView ? srcSet : undefined}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        // @ts-expect-error - fetchpriority is a valid HTML attribute but not yet in React types
        fetchpriority={priority ? 'high' : 'auto'}
        onLoad={handleLoad}
        onError={handleError}
        className={`
          w-full h-full object-cover
          transition-opacity duration-500 ease-in-out
          ${isLoaded ? 'opacity-100' : 'opacity-0'}
          ${hasError ? 'hidden' : ''}
        `}
      />

      {/* Error fallback */}
      {hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-slate-800/50 text-slate-400"
          aria-label={`Failed to load image: ${alt}`}
        >
          <svg
            className="w-12 h-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      {/* Loading skeleton */}
      {!isLoaded && !hasError && !placeholder && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 animate-pulse"
          aria-hidden="true"
        />
      )}
    </div>
  );
};

/* =============================================================================
   Image Optimization Utilities
   ============================================================================= */

/**
 * Generate responsive srcSet for different screen sizes
 */
export function generateSrcSet(
  basePath: string,
  widths: number[] = [320, 640, 960, 1280, 1920]
): string {
  return widths
    .map((w) => {
      const url = basePath.replace(/\.(jpg|jpeg|png)$/i, `-${w}w.$1`);
      return `${url} ${w}w`;
    })
    .join(', ');
}

/**
 * Generate responsive sizes attribute
 */
export function generateSizes(
  breakpoints: { maxWidth: number; size: string }[] = [
    { maxWidth: 640, size: '100vw' },
    { maxWidth: 1024, size: '50vw' },
    { maxWidth: 1280, size: '33vw' },
  ],
  defaultSize: string = '25vw'
): string {
  const sizes = breakpoints.map(
    ({ maxWidth, size }) => `(max-width: ${maxWidth}px) ${size}`
  );
  sizes.push(defaultSize);
  return sizes.join(', ');
}

/**
 * Check if WebP is supported
 */
export async function isWebPSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const webpData = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0 && img.height > 0);
    img.onerror = () => resolve(false);
    img.src = webpData;
  });
}

/**
 * Preload critical images
 */
export function preloadImage(src: string, priority: 'high' | 'low' = 'high'): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.setAttribute('fetchpriority', priority);
  document.head.appendChild(link);
}

/**
 * Preload multiple images with batching
 */
export function preloadImages(
  images: string[],
  batchSize: number = 3,
  delay: number = 100
): void {
  images.forEach((src, index) => {
    const batchDelay = Math.floor(index / batchSize) * delay;
    setTimeout(() => preloadImage(src, 'low'), batchDelay);
  });
}

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;
