/**
 * useLightboxSlideshow Hook
 * Manages slideshow auto-advance, timer, and Ken Burns effect state
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface SlideshowSettings {
  /** Interval between slides in milliseconds (default: 5000) */
  interval: number;
  /** Whether to loop back to start (default: true) */
  loop: boolean;
  /** Whether to hide UI during slideshow (default: true) */
  hideUI: boolean;
  /** Ken Burns effect settings */
  kenBurns: {
    enabled: boolean;
    minZoom: number;
    maxZoom: number;
    randomDirection: boolean;
  };
}

export interface KenBurnsTransform {
  /** Starting scale */
  startScale: number;
  /** Ending scale */
  endScale: number;
  /** Starting X offset (percentage) */
  startX: number;
  /** Starting Y offset (percentage) */
  startY: number;
  /** Ending X offset (percentage) */
  endX: number;
  /** Ending Y offset (percentage) */
  endY: number;
}

export interface UseLightboxSlideshowOptions {
  /** Whether slideshow is enabled */
  enabled?: boolean;
  /** Current asset index */
  currentIndex: number;
  /** Total number of assets */
  totalAssets: number;
  /** Callback to navigate to next slide */
  onNavigate: (index: number) => void;
  /** Slideshow settings */
  settings?: Partial<SlideshowSettings>;
  /** Callback when slideshow completes (non-looping) */
  onComplete?: () => void;
}

export interface UseLightboxSlideshowReturn {
  /** Whether slideshow is currently playing */
  isPlaying: boolean;
  /** Start the slideshow */
  play: () => void;
  /** Pause the slideshow */
  pause: () => void;
  /** Toggle play/pause */
  toggle: () => void;
  /** Stop the slideshow completely */
  stop: () => void;
  /** Time remaining on current slide (ms) */
  timeRemaining: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current Ken Burns transform for animation */
  kenBurnsTransform: KenBurnsTransform;
  /** Current slideshow settings */
  settings: SlideshowSettings;
  /** Update settings */
  updateSettings: (newSettings: Partial<SlideshowSettings>) => void;
  /** Whether we're on the last slide */
  isLastSlide: boolean;
  /** Go to next slide manually */
  nextSlide: () => void;
  /** Go to previous slide manually */
  prevSlide: () => void;
}

const defaultSettings: SlideshowSettings = {
  interval: 5000,
  loop: true,
  hideUI: true,
  kenBurns: {
    enabled: true,
    minZoom: 1.0,
    maxZoom: 1.15,
    randomDirection: true,
  },
};

/**
 * Generate a random Ken Burns transform
 */
function generateKenBurnsTransform(settings: SlideshowSettings['kenBurns']): KenBurnsTransform {
  const { minZoom, maxZoom, randomDirection } = settings;

  // Random zoom direction (zoom in or zoom out)
  const zoomIn = randomDirection ? Math.random() > 0.5 : true;
  const startScale = zoomIn ? minZoom : maxZoom;
  const endScale = zoomIn ? maxZoom : minZoom;

  // Random pan direction
  const panRange = 5; // 5% movement
  const randomPan = () => (Math.random() - 0.5) * panRange * 2;

  if (randomDirection) {
    return {
      startScale,
      endScale,
      startX: randomPan(),
      startY: randomPan(),
      endX: randomPan(),
      endY: randomPan(),
    };
  }

  // Default subtle pan
  return {
    startScale,
    endScale,
    startX: -2,
    startY: -1,
    endX: 2,
    endY: 1,
  };
}

/**
 * useLightboxSlideshow - Manages slideshow functionality
 *
 * @example
 * ```tsx
 * const slideshow = useLightboxSlideshow({
 *   currentIndex,
 *   totalAssets: assets.length,
 *   onNavigate: setCurrentIndex,
 *   settings: { interval: 3000, loop: true },
 * });
 *
 * // Start slideshow
 * slideshow.play();
 *
 * // Check progress
 * console.log(`${slideshow.progress}% complete`);
 * ```
 */
export function useLightboxSlideshow(options: UseLightboxSlideshowOptions): UseLightboxSlideshowReturn {
  const {
    enabled = true,
    currentIndex,
    totalAssets,
    onNavigate,
    settings: settingsOverride,
    onComplete,
  } = options;

  // Merge settings with defaults
  const [settings, setSettings] = useState<SlideshowSettings>(() => ({
    ...defaultSettings,
    ...settingsOverride,
    kenBurns: {
      ...defaultSettings.kenBurns,
      ...(settingsOverride?.kenBurns || {}),
    },
  }));

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(settings.interval);
  const [kenBurnsTransform, setKenBurnsTransform] = useState<KenBurnsTransform>(() =>
    generateKenBurnsTransform(settings.kenBurns)
  );

  // Refs for timer management
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // Derived state
  const isLastSlide = currentIndex === totalAssets - 1;
  const progress = useMemo(
    () => ((settings.interval - timeRemaining) / settings.interval) * 100,
    [settings.interval, timeRemaining]
  );

  // Generate new Ken Burns transform when slide changes
  useEffect(() => {
    if (settings.kenBurns.enabled) {
      setKenBurnsTransform(generateKenBurnsTransform(settings.kenBurns));
    }
  }, [currentIndex, settings.kenBurns]);

  // Reset time remaining when slide changes or settings change
  useEffect(() => {
    setTimeRemaining(settings.interval);
    lastTickRef.current = Date.now();
  }, [currentIndex, settings.interval]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer logic
  useEffect(() => {
    if (!enabled || !isPlaying) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start timer
    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setTimeRemaining((prev) => {
        const newRemaining = prev - elapsed;

        if (newRemaining <= 0) {
          // Time to advance
          if (isLastSlide) {
            if (settings.loop) {
              // Loop to start
              onNavigate(0);
              return settings.interval;
            } else {
              // Stop at end
              setIsPlaying(false);
              onComplete?.();
              return 0;
            }
          } else {
            // Go to next slide
            onNavigate(currentIndex + 1);
            return settings.interval;
          }
        }

        return newRemaining;
      });
    }, 100); // Update every 100ms for smooth progress

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isPlaying, isLastSlide, settings.loop, settings.interval, currentIndex, onNavigate, onComplete]);

  // Actions
  const play = useCallback(() => {
    if (!enabled) return;
    setIsPlaying(true);
    lastTickRef.current = Date.now();
  }, [enabled]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setTimeRemaining(settings.interval);
  }, [settings.interval]);

  const nextSlide = useCallback(() => {
    if (isLastSlide) {
      if (settings.loop) {
        onNavigate(0);
      }
    } else {
      onNavigate(currentIndex + 1);
    }
    // Reset timer for new slide
    setTimeRemaining(settings.interval);
    lastTickRef.current = Date.now();
  }, [isLastSlide, settings.loop, settings.interval, currentIndex, onNavigate]);

  const prevSlide = useCallback(() => {
    if (currentIndex === 0) {
      if (settings.loop) {
        onNavigate(totalAssets - 1);
      }
    } else {
      onNavigate(currentIndex - 1);
    }
    // Reset timer for new slide
    setTimeRemaining(settings.interval);
    lastTickRef.current = Date.now();
  }, [currentIndex, settings.loop, settings.interval, totalAssets, onNavigate]);

  const updateSettings = useCallback((newSettings: Partial<SlideshowSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...newSettings,
      kenBurns: {
        ...prev.kenBurns,
        ...(newSettings.kenBurns || {}),
      },
    }));
  }, []);

  return {
    isPlaying,
    play,
    pause,
    toggle,
    stop,
    timeRemaining,
    progress,
    kenBurnsTransform,
    settings,
    updateSettings,
    isLastSlide,
    nextSlide,
    prevSlide,
  };
}

export default useLightboxSlideshow;
