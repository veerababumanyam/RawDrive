/**
 * Performance Optimization Hooks
 *
 * Collection of hooks for optimizing profile editor performance
 * including lazy loading, caching, debouncing, and prefetching.
 *
 * Requirements: 11.5, 11.6, 11.7, 11.8, 11.10
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Maximum cache entries */
  maxEntries?: number;
  /** Storage type */
  storage?: 'memory' | 'session' | 'local';
}

export interface LazyLoadOptions {
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Threshold for visibility */
  threshold?: number | number[];
  /** Placeholder while loading */
  placeholder?: React.ReactNode;
}

export interface DebouncedValue<T> {
  value: T;
  isPending: boolean;
}

export interface PrefetchOptions {
  /** Priority level */
  priority?: 'high' | 'low';
  /** Preload on hover */
  preloadOnHover?: boolean;
}

// =============================================================================
// Cache Implementation
// =============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class PerformanceCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttl = 300000): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instances
const memoryCache = new PerformanceCache<unknown>(100);
const themeCache = new PerformanceCache<unknown>(50);
const assetCache = new PerformanceCache<string>(200);

// =============================================================================
// useDebounce Hook
// =============================================================================

/**
 * Debounce a value with configurable delay
 * Requirement 11.7: Debouncing for preview updates
 */
export function useDebounce<T>(value: T, delay = 300): DebouncedValue<T> {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsPending(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
      setIsPending(false);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return { value: debouncedValue, isPending };
}

// =============================================================================
// useDebouncedCallback Hook
// =============================================================================

/**
 * Create a debounced callback function
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref on change
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

// =============================================================================
// useLazyLoad Hook
// =============================================================================

/**
 * Lazy load content when it enters the viewport
 * Requirement 11.5: Lazy loading implementation
 */
export function useLazyLoad(
  options: LazyLoadOptions = {}
): {
  ref: React.RefCallback<Element>;
  isInView: boolean;
  hasLoaded: boolean;
} {
  const [isInView, setIsInView] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: Element | null) => {
      // Cleanup previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          const inView = entry.isIntersecting;
          setIsInView(inView);
          if (inView && !hasLoaded) {
            setHasLoaded(true);
          }
        },
        {
          rootMargin: options.rootMargin || '50px',
          threshold: options.threshold || 0,
        }
      );

      observerRef.current.observe(node);
    },
    [options.rootMargin, options.threshold, hasLoaded]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { ref, isInView, hasLoaded };
}

// =============================================================================
// useCache Hook
// =============================================================================

/**
 * Cache data with configurable TTL
 * Requirement 11.6: Theme and font caching
 */
export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const { ttl = 300000, storage = 'memory' } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const getCache = useCallback(() => {
    switch (storage) {
      case 'session': {
        const stored = sessionStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp < ttl) {
              return parsed.value as T;
            }
            sessionStorage.removeItem(key);
          } catch {
            sessionStorage.removeItem(key);
          }
        }
        return undefined;
      }
      case 'local': {
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp < ttl) {
              return parsed.value as T;
            }
            localStorage.removeItem(key);
          } catch {
            localStorage.removeItem(key);
          }
        }
        return undefined;
      }
      default:
        return memoryCache.get(key) as T | undefined;
    }
  }, [key, ttl, storage]);

  const setCache = useCallback(
    (value: T) => {
      switch (storage) {
        case 'session':
          sessionStorage.setItem(
            key,
            JSON.stringify({ value, timestamp: Date.now() })
          );
          break;
        case 'local':
          localStorage.setItem(
            key,
            JSON.stringify({ value, timestamp: Date.now() })
          );
          break;
        default:
          memoryCache.set(key, value, ttl);
      }
    },
    [key, ttl, storage]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Check cache first
    const cached = getCache();
    if (cached !== undefined) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    try {
      const result = await fetcher();
      setData(result);
      setCache(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, getCache, setCache]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    // Clear cache
    switch (storage) {
      case 'session':
        sessionStorage.removeItem(key);
        break;
      case 'local':
        localStorage.removeItem(key);
        break;
      default:
        memoryCache.delete(key);
    }
    await fetchData();
  }, [key, storage, fetchData]);

  return { data, isLoading, error, refresh };
}

// =============================================================================
// useThrottledCallback Hook
// =============================================================================

/**
 * Create a throttled callback (limits execution rate)
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  limit = 100
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastRunRef.current >= limit) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      } else {
        // Schedule for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          callbackRef.current(...args);
        }, limit - (now - lastRunRef.current));
      }
    },
    [limit]
  );
}

// =============================================================================
// usePrefetch Hook
// =============================================================================

/**
 * Prefetch resources for faster navigation
 */
export function usePrefetch<T>(
  fetcher: () => Promise<T>,
  _options: PrefetchOptions = {}
): {
  prefetch: () => void;
  data: T | undefined;
  isLoading: boolean;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const hasPrefetchedRef = useRef(false);

  const prefetch = useCallback(async () => {
    if (hasPrefetchedRef.current || isLoading) return;

    hasPrefetchedRef.current = true;
    setIsLoading(true);

    try {
      const result = await fetcher();
      setData(result);
    } catch {
      // Silent fail for prefetch
      hasPrefetchedRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, isLoading]);

  return { prefetch, data, isLoading };
}

// =============================================================================
// useVirtualization Hook
// =============================================================================

/**
 * Virtual scrolling for large lists
 */
export function useVirtualization<T>(
  items: T[],
  options: {
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
  }
): {
  virtualItems: Array<{ index: number; item: T; style: React.CSSProperties }>;
  totalHeight: number;
  scrollToIndex: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const { itemHeight, containerHeight, overscan = 3 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;

  const virtualItems = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const visibleItems: Array<{
      index: number;
      item: T;
      style: React.CSSProperties;
    }> = [];

    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        index: i,
        item: items[i],
        style: {
          position: 'absolute',
          top: i * itemHeight,
          height: itemHeight,
          left: 0,
          right: 0,
        },
      });
    }

    return visibleItems;
  }, [items, scrollTop, itemHeight, containerHeight, overscan]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = index * itemHeight;
      }
    },
    [itemHeight]
  );

  return { virtualItems, totalHeight, scrollToIndex, containerRef };
}

// =============================================================================
// useImagePreload Hook
// =============================================================================

/**
 * Preload images for smoother loading
 */
export function useImagePreload(
  urls: string[]
): {
  loadedUrls: Set<string>;
  isLoading: boolean;
  progress: number;
} {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (urls.length === 0) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const loaded = new Set<string>();

    const loadImage = (url: string): Promise<void> => {
      return new Promise((resolve) => {
        // Check cache first
        if (assetCache.has(url)) {
          loaded.add(url);
          setLoadedUrls(new Set(loaded));
          resolve();
          return;
        }

        const img = new Image();
        img.onload = () => {
          loaded.add(url);
          assetCache.set(url, url, 600000); // 10 min cache
          setLoadedUrls(new Set(loaded));
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    };

    Promise.all(urls.map(loadImage)).then(() => {
      setIsLoading(false);
    });
  }, [urls]);

  const progress = urls.length > 0 ? loadedUrls.size / urls.length : 1;

  return { loadedUrls, isLoading, progress };
}

// =============================================================================
// usePerformanceMetrics Hook
// =============================================================================

/**
 * Track performance metrics
 */
export function usePerformanceMetrics(): {
  markStart: (name: string) => void;
  markEnd: (name: string) => number;
  getMetrics: () => Record<string, number>;
  clearMetrics: () => void;
} {
  const metricsRef = useRef<Map<string, number>>(new Map());
  const startTimesRef = useRef<Map<string, number>>(new Map());

  const markStart = useCallback((name: string) => {
    startTimesRef.current.set(name, performance.now());
  }, []);

  const markEnd = useCallback((name: string): number => {
    const startTime = startTimesRef.current.get(name);
    if (startTime === undefined) return 0;

    const duration = performance.now() - startTime;
    metricsRef.current.set(name, duration);
    startTimesRef.current.delete(name);
    return duration;
  }, []);

  const getMetrics = useCallback((): Record<string, number> => {
    return Object.fromEntries(metricsRef.current);
  }, []);

  const clearMetrics = useCallback(() => {
    metricsRef.current.clear();
    startTimesRef.current.clear();
  }, []);

  return { markStart, markEnd, getMetrics, clearMetrics };
}

// =============================================================================
// Export Cache Utilities
// =============================================================================

export { themeCache, assetCache, memoryCache };

export function clearAllCaches(): void {
  memoryCache.clear();
  themeCache.clear();
  assetCache.clear();
  sessionStorage.clear();
}
