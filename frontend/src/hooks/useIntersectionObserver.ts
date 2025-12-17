import { useState, useEffect, useRef, RefObject } from 'react';

/* =============================================================================
   useIntersectionObserver Hook

   Detects when an element enters the viewport.
   Useful for lazy loading and scroll-triggered animations.
   ============================================================================= */

interface UseIntersectionObserverOptions {
  /** Threshold(s) at which to trigger the callback */
  threshold?: number | number[];
  /** Root margin around the root element */
  rootMargin?: string;
  /** The element to use as the viewport for checking visibility */
  root?: Element | null;
  /** Whether to stop observing after the element becomes visible */
  triggerOnce?: boolean;
  /** Whether to start observing immediately */
  enabled?: boolean;
}

interface UseIntersectionObserverReturn {
  /** Ref to attach to the target element */
  ref: RefObject<HTMLElement>;
  /** Whether the element is currently in view */
  isInView: boolean;
  /** The full IntersectionObserverEntry */
  entry: IntersectionObserverEntry | null;
}

export const useIntersectionObserver = (
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn => {
  const {
    threshold = 0,
    rootMargin = '0px',
    root = null,
    triggerOnce = false,
    enabled = true,
  } = options;

  const ref = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;

    // If triggerOnce is true and already triggered, don't observe
    if (triggerOnce && isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
        setEntry(entry);

        // Unobserve if triggerOnce is true and element is in view
        if (triggerOnce && entry.isIntersecting && ref.current) {
          observer.unobserve(ref.current);
        }
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [enabled, threshold, rootMargin, root, triggerOnce, isInView]);

  return { ref: ref as RefObject<HTMLElement>, isInView, entry };
};

export default useIntersectionObserver;
