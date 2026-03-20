import { useState, useEffect, useRef } from 'react';

interface UseProgressiveImageOptions {
  /** Full-resolution image URL */
  src: string;
  /** Low Quality Image Placeholder data URI */
  lqip?: string;
}

interface UseProgressiveImageResult {
  /** Current image source — lqip before load, full src after */
  currentSrc: string;
  /** True once the full-resolution image has loaded */
  isLoaded: boolean;
  /** True if the full-resolution image failed to load */
  isError: boolean;
}

/**
 * Progressive image loading hook.
 *
 * Preloads the full-resolution image in a hidden `Image` element. While
 * loading, `currentSrc` returns the LQIP data URI (if provided) so the
 * consumer can show a blurred placeholder. Once loaded, `currentSrc` switches
 * to the full URL.
 *
 * If no LQIP is provided, `currentSrc` is the full URL from the start (the
 * consumer just won't have a blur phase).
 */
export function useProgressiveImage({
  src,
  lqip,
}: UseProgressiveImageOptions): UseProgressiveImageResult {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Reset state when src changes
    setIsLoaded(false);
    setIsError(false);

    const img = new Image();
    imgRef.current = img;

    img.onload = () => {
      setIsLoaded(true);
    };

    img.onerror = () => {
      setIsError(true);
    };

    img.src = src;

    return () => {
      // Abort in-flight load on unmount / src change
      img.onload = null;
      img.onerror = null;
      img.src = '';
      imgRef.current = null;
    };
  }, [src]);

  const currentSrc = isLoaded || !lqip ? src : lqip;

  return { currentSrc, isLoaded, isError };
}
