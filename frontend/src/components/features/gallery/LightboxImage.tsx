/**
 * LightboxImage Component
 * Image display with LQIP (Low Quality Image Placeholder) blur-up effect
 * Provides smooth loading experience with progressive enhancement
 */

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface LightboxImageProps {
  /** Main image URL to display */
  src: string;
  /** LQIP (Low Quality Image Placeholder) data URI for blur-up effect */
  lqip?: string;
  /** Alt text for accessibility */
  alt: string;
  /** Whether the image is currently loading */
  isLoading?: boolean;
  /** Error state */
  hasError?: boolean;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
  /** Custom className for the container */
  className?: string;
  /** Whether to respect reduced motion preference (default: true) */
  respectReducedMotion?: boolean;
}

export interface LightboxImageRef {
  /** Reference to the main image element */
  imageElement: HTMLImageElement | null;
  /** Whether the full image has loaded */
  isLoaded: boolean;
}

/**
 * LightboxImage with LQIP blur-up effect
 *
 * @example
 * ```tsx
 * <LightboxImage
 *   src={signedUrl}
 *   lqip={asset.lqip}
 *   alt={asset.filename}
 *   onLoad={() => console.log('Image loaded')}
 * />
 * ```
 */
export const LightboxImage = forwardRef<LightboxImageRef, LightboxImageProps>(
  function LightboxImage(
    {
      src,
      lqip,
      alt,
      isLoading = false,
      hasError = false,
      onLoad,
      onError,
      className = '',
      respectReducedMotion = true,
    },
    ref
  ) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [showLqip, setShowLqip] = useState(!!lqip);
    const imageRef = useRef<HTMLImageElement>(null);

    // Check for reduced motion preference
    const prefersReducedMotion = respectReducedMotion
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      : false;

    // Expose ref to parent
    useImperativeHandle(ref, () => ({
      imageElement: imageRef.current,
      isLoaded: imageLoaded,
    }), [imageLoaded]);

    // Reset state when src changes
    useEffect(() => {
      setImageLoaded(false);
      setShowLqip(!!lqip);
    }, [src, lqip]);

    // Handle successful image load
    const handleLoad = useCallback(() => {
      setImageLoaded(true);
      // Delay hiding LQIP to allow crossfade animation
      if (!prefersReducedMotion) {
        setTimeout(() => setShowLqip(false), 300);
      } else {
        setShowLqip(false);
      }
      onLoad?.();
    }, [onLoad, prefersReducedMotion]);

    // Handle image load error
    const handleError = useCallback(() => {
      setImageLoaded(false);
      setShowLqip(false);
      onError?.();
    }, [onError]);

    // Animation variants for smooth transitions
    const lqipVariants = {
      visible: {
        opacity: 1,
        filter: 'blur(20px)',
        scale: 1.05, // Slight scale to hide edge blur artifacts
      },
      hidden: {
        opacity: 0,
        filter: 'blur(0px)',
        scale: 1,
        transition: {
          duration: prefersReducedMotion ? 0 : 0.4,
          ease: 'easeOut',
        },
      },
    };

    const imageVariants = {
      hidden: {
        opacity: 0,
      },
      visible: {
        opacity: 1,
        transition: {
          duration: prefersReducedMotion ? 0 : 0.3,
          ease: 'easeOut',
        },
      },
    };

    // Show loading state
    if (isLoading && !lqip) {
      return (
        <div className={`relative flex items-center justify-center ${className}`}>
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-sm text-white/70">Loading image...</p>
          </div>
        </div>
      );
    }

    // Show error state
    if (hasError) {
      return (
        <div className={`relative flex items-center justify-center ${className}`}>
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-white/70">Failed to load image</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* LQIP Layer - Shows blurred placeholder while full image loads */}
        <AnimatePresence>
          {showLqip && lqip && (
            <motion.img
              key="lqip"
              src={lqip}
              alt=""
              aria-hidden="true"
              variants={lqipVariants}
              initial="visible"
              animate={imageLoaded ? 'hidden' : 'visible'}
              exit="hidden"
              className={`absolute inset-0 w-full h-full pointer-events-none select-none ${className}`}
              style={{
                objectFit: 'contain',
                // GPU acceleration for blur
                willChange: 'opacity, filter',
              }}
            />
          )}
        </AnimatePresence>

        {/* Main Image Layer - Industry standard: absolute + object-fit */}
        <motion.img
          ref={imageRef}
          src={src}
          alt={alt}
          variants={imageVariants}
          initial="hidden"
          animate={imageLoaded ? 'visible' : 'hidden'}
          onLoad={handleLoad}
          onError={handleError}
          className={`absolute inset-0 w-full h-full select-none ${className}`}
          style={{
            objectFit: 'contain',
            // Ensure smooth rendering
            imageRendering: 'auto',
            willChange: 'opacity',
          }}
          draggable={false}
        />

        {/* Loading indicator overlay - shows when waiting for full image */}
        {!imageLoaded && !showLqip && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </>
    );
  }
);

export default LightboxImage;
