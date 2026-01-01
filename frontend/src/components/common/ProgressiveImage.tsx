/**
 * Progressive Image Loading Component
 *
 * Loads images progressively with placeholder, blur-up effect,
 * and lazy loading support for improved performance.
 *
 * Feature: 016-save-the-date Phase 13
 */

import React, { useState, useEffect, useRef } from 'react';
import { ImageOff } from 'lucide-react';

interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholderSrc?: string;
  alt: string;
  aspectRatio?: number;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  blurAmount?: number;
  lazy?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  fallback?: React.ReactNode;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  placeholderSrc,
  alt,
  aspectRatio,
  objectFit = 'cover',
  blurAmount = 20,
  lazy = true,
  onLoad,
  onError,
  fallback,
  className = '',
  ...props
}) => {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc || '');
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Reset state when src changes
    setLoadState('loading');
    setCurrentSrc(placeholderSrc || '');

    if (lazy && 'IntersectionObserver' in window) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadImage();
              observerRef.current?.disconnect();
            }
          });
        },
        { rootMargin: '100px' }
      );

      if (imgRef.current) {
        observerRef.current.observe(imgRef.current);
      }
    } else {
      loadImage();
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [src, placeholderSrc, lazy]);

  const loadImage = () => {
    const img = new Image();
    img.src = src;

    img.onload = () => {
      setCurrentSrc(src);
      setLoadState('loaded');
      onLoad?.();
    };

    img.onerror = () => {
      setLoadState('error');
      onError?.();
    };
  };

  const containerStyle: React.CSSProperties = aspectRatio
    ? { paddingBottom: `${(1 / aspectRatio) * 100}%`, position: 'relative' }
    : {};

  const imgStyle: React.CSSProperties = {
    objectFit,
    filter: loadState === 'loading' && placeholderSrc ? `blur(${blurAmount}px)` : 'none',
    transition: 'filter 0.3s ease-out, opacity 0.3s ease-out',
    opacity: loadState === 'error' ? 0 : 1,
    ...(aspectRatio && {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    }),
  };

  if (loadState === 'error') {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div
        className={`bg-surface-alt flex items-center justify-center ${className}`}
        style={aspectRatio ? containerStyle : { minHeight: 100 }}
      >
        <div className="text-center text-text-tertiary">
          <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <span className="text-sm">Failed to load image</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle} className={aspectRatio ? 'relative overflow-hidden' : ''}>
      <img
        ref={imgRef}
        src={currentSrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
        alt={alt}
        loading={lazy ? 'lazy' : 'eager'}
        className={`${className} ${loadState === 'loading' ? 'animate-pulse bg-surface-alt' : ''}`}
        style={imgStyle}
        {...props}
      />
    </div>
  );
};

/**
 * Generate a small placeholder from a color or extract dominant color
 */
export const generatePlaceholder = (
  width: number = 10,
  height: number = 10,
  color: string = '#e0e0e0'
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  
  return canvas.toDataURL('image/jpeg', 0.1);
};

/**
 * Hook for lazy loading images with Intersection Observer
 */
export const useLazyImage = (src: string, options?: IntersectionObserverInit) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.onerror = () => setError(true);
    img.src = src;
  }, [isInView, src]);

  return { ref, isLoaded, isInView, error };
};

export default ProgressiveImage;
