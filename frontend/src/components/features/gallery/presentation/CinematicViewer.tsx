/**
 * CinematicViewer Component
 * Full-screen, edge-to-edge cinematic presentation mode for gallery viewing
 *
 * Features:
 * - Edge-to-edge full-screen display with no UI distractions
 * - Auto-hiding controls with elegant fade animations
 * - Smooth image transitions with configurable effects
 * - Ken Burns animation support
 * - Keyboard navigation and accessibility support
 * - Touch/swipe gestures for mobile devices
 * - Progress indicator for slideshow mode
 * - Support for both photos and videos
 * - Respects prefers-reduced-motion for accessibility
 *
 * @module presentation/CinematicViewer
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Settings2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  RotateCcw,
  Grid,
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import type { GalleryAssetItem } from '../../../../types/gallery';
import {
  useLightboxSlideshow,
  type SlideshowSettings,
  type KenBurnsTransform,
} from '../../../../hooks/lightbox/useLightboxSlideshow';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Transition effect types for cinematic presentation
 */
export type CinematicTransition =
  | 'fade'           // Simple cross-fade
  | 'slide'          // Horizontal slide
  | 'zoom'           // Zoom in/out
  | 'kenburns'       // Ken Burns pan & zoom
  | 'reveal'         // Vertical reveal wipe
  | 'instant';       // No transition

/**
 * Configuration for cinematic viewer
 */
export interface CinematicViewerSettings {
  /** Interval between slides in milliseconds (default: 5000) */
  interval: number;
  /** Whether to loop back to start (default: true) */
  loop: boolean;
  /** Auto-hide UI during playback (default: true) */
  autoHideUI: boolean;
  /** Delay before hiding UI in ms (default: 3000) */
  autoHideDelay: number;
  /** Transition effect type */
  transition: CinematicTransition;
  /** Ken Burns effect settings */
  kenBurns: {
    enabled: boolean;
    intensity: number; // 0-1, how aggressive the pan/zoom is
  };
  /** Audio settings for background music */
  audio: {
    enabled: boolean;
    volume: number; // 0-1
    muted: boolean;
  };
  /** Show progress indicator */
  showProgress: boolean;
  /** Show image counter (e.g., "5 / 20") */
  showCounter: boolean;
}

/**
 * Props for CinematicViewer component
 */
export interface CinematicViewerProps {
  /** Whether the viewer is open */
  isOpen: boolean;
  /** Callback when viewer should close */
  onClose: () => void;
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Initial asset index to display */
  initialIndex?: number;
  /** Callback when index changes */
  onIndexChange?: (index: number) => void;
  /** Function to get signed URL for an asset */
  getAssetUrl: (assetId: string, variant?: 'preview' | 'original' | 'thumbnail') => string | undefined;
  /** Initial settings */
  settings?: Partial<CinematicViewerSettings>;
  /** Background music URL */
  musicUrl?: string;
  /** Gallery title for display */
  galleryTitle?: string;
  /** Photographer/studio branding */
  branding?: {
    name?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
  /** Custom className */
  className?: string;
}

// ============================================================================
// Default Settings
// ============================================================================

const defaultSettings: CinematicViewerSettings = {
  interval: 5000,
  loop: true,
  autoHideUI: true,
  autoHideDelay: 3000,
  transition: 'fade',
  kenBurns: {
    enabled: true,
    intensity: 0.5,
  },
  audio: {
    enabled: false,
    volume: 0.7,
    muted: false,
  },
  showProgress: true,
  showCounter: true,
};

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Progress bar showing current slide progress
 */
const ProgressBar: React.FC<{
  progress: number;
  isPlaying: boolean;
  color?: string;
}> = ({ progress, isPlaying, color = 'white' }) => (
  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10">
    <motion.div
      className="h-full"
      style={{ backgroundColor: color }}
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.1, ease: 'linear' }}
    />
    {!isPlaying && (
      <motion.div
        className="absolute inset-0 bg-white/10"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    )}
  </div>
);

/**
 * Thumbnail filmstrip for quick navigation
 */
const ThumbnailStrip: React.FC<{
  assets: GalleryAssetItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  getAssetUrl: (assetId: string, variant?: 'preview' | 'original' | 'thumbnail') => string | undefined;
  visible: boolean;
}> = ({ assets, currentIndex, onSelect, getAssetUrl, visible }) => {
  const stripRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to center current thumbnail
  useEffect(() => {
    if (stripRef.current && visible) {
      const container = stripRef.current;
      const thumbnailWidth = 80; // Approximate width including gap
      const containerWidth = container.clientWidth;
      const scrollPosition = currentIndex * thumbnailWidth - containerWidth / 2 + thumbnailWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' });
    }
  }, [currentIndex, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-20 left-0 right-0 z-20 px-4"
        >
          <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto py-2 px-2 scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {assets.slice(0, 50).map((asset, index) => (
              <button
                key={asset.asset_id}
                onClick={() => onSelect(index)}
                className={`
                  flex-shrink-0 w-16 h-12 rounded-md overflow-hidden transition-all duration-200
                  ${index === currentIndex
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                    : 'opacity-60 hover:opacity-100'
                  }
                `}
              >
                <img
                  src={getAssetUrl(asset.asset_id, 'thumbnail') || ''}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
            {assets.length > 50 && (
              <div className="flex-shrink-0 w-16 h-12 rounded-md bg-white/10 flex items-center justify-center text-white/60 text-xs">
                +{assets.length - 50}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Settings panel for cinematic viewer
 */
const SettingsPanel: React.FC<{
  settings: CinematicViewerSettings;
  onUpdate: (updates: Partial<CinematicViewerSettings>) => void;
  onClose: () => void;
}> = ({ settings, onUpdate, onClose }) => {
  const intervals = [
    { label: '3s', value: 3000 },
    { label: '5s', value: 5000 },
    { label: '7s', value: 7000 },
    { label: '10s', value: 10000 },
    { label: '15s', value: 15000 },
  ];

  const transitions: Array<{ label: string; value: CinematicTransition }> = [
    { label: 'Fade', value: 'fade' },
    { label: 'Slide', value: 'slide' },
    { label: 'Zoom', value: 'zoom' },
    { label: 'Ken Burns', value: 'kenburns' },
    { label: 'Reveal', value: 'reveal' },
    { label: 'Instant', value: 'instant' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="absolute bottom-24 right-4 z-50 bg-black/90 backdrop-blur-xl rounded-xl p-5 min-w-[280px] border border-white/10 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-semibold text-lg">Presentation Settings</h3>
        <AppButton
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white/60 hover:text-white h-8 w-8"
        >
          <X size={16} />
        </AppButton>
      </div>

      {/* Interval Selection */}
      <div className="mb-5">
        <label className="text-white/70 text-sm mb-2 block font-medium">Slide Duration</label>
        <div className="flex gap-2">
          {intervals.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onUpdate({ interval: value })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                settings.interval === value
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Transition Type */}
      <div className="mb-5">
        <label className="text-white/70 text-sm mb-2 block font-medium">Transition Effect</label>
        <div className="grid grid-cols-3 gap-2">
          {transitions.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onUpdate({ transition: value })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                settings.transition === value
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        {/* Loop Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">Loop Slideshow</span>
          <button
            onClick={() => onUpdate({ loop: !settings.loop })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.loop ? 'bg-white' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                settings.loop ? 'left-6 bg-black' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Ken Burns Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">Ken Burns Effect</span>
          <button
            onClick={() => onUpdate({ kenBurns: { ...settings.kenBurns, enabled: !settings.kenBurns.enabled } })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.kenBurns.enabled ? 'bg-white' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                settings.kenBurns.enabled ? 'left-6 bg-black' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Auto-hide UI Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">Auto-hide Controls</span>
          <button
            onClick={() => onUpdate({ autoHideUI: !settings.autoHideUI })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.autoHideUI ? 'bg-white' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                settings.autoHideUI ? 'left-6 bg-black' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Show Progress Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">Show Progress Bar</span>
          <button
            onClick={() => onUpdate({ showProgress: !settings.showProgress })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.showProgress ? 'bg-white' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                settings.showProgress ? 'left-6 bg-black' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Cinematic image display with Ken Burns animation
 */
const CinematicImage: React.FC<{
  src: string;
  alt: string;
  kenBurnsTransform?: KenBurnsTransform;
  transition: CinematicTransition;
  duration: number;
  isKenBurnsEnabled: boolean;
  prefersReducedMotion: boolean;
  onLoad?: () => void;
}> = ({
  src,
  alt,
  kenBurnsTransform,
  transition,
  duration,
  isKenBurnsEnabled,
  prefersReducedMotion,
  onLoad,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset loaded state when src changes
  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  // Generate CSS animation style for Ken Burns
  const animationStyle = useMemo(() => {
    if (!isKenBurnsEnabled || prefersReducedMotion || !kenBurnsTransform) {
      return {};
    }

    return {
      animation: `kenBurns ${duration}ms ease-in-out forwards`,
      '--kb-start-scale': kenBurnsTransform.startScale,
      '--kb-end-scale': kenBurnsTransform.endScale,
      '--kb-start-x': `${kenBurnsTransform.startX}%`,
      '--kb-start-y': `${kenBurnsTransform.startY}%`,
      '--kb-end-x': `${kenBurnsTransform.endX}%`,
      '--kb-end-y': `${kenBurnsTransform.endY}%`,
    } as React.CSSProperties;
  }, [isKenBurnsEnabled, prefersReducedMotion, kenBurnsTransform, duration]);

  // Transition variants for Framer Motion
  const getTransitionVariants = () => {
    if (prefersReducedMotion || transition === 'instant') {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      };
    }

    switch (transition) {
      case 'slide':
        return {
          initial: { opacity: 0, x: 100 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -100 },
          transition: { duration: 0.5, ease: 'easeInOut' },
        };
      case 'zoom':
        return {
          initial: { opacity: 0, scale: 1.2 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 0.8 },
          transition: { duration: 0.5, ease: 'easeInOut' },
        };
      case 'reveal':
        return {
          initial: { opacity: 0, clipPath: 'inset(100% 0 0 0)' },
          animate: { opacity: 1, clipPath: 'inset(0 0 0 0)' },
          exit: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
          transition: { duration: 0.6, ease: 'easeInOut' },
        };
      case 'kenburns':
      case 'fade':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.5 },
        };
    }
  };

  const variants = getTransitionVariants();

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Ken Burns CSS Animation */}
      <style>{`
        @keyframes kenBurns {
          0% {
            transform: scale(var(--kb-start-scale, 1)) translate(var(--kb-start-x, 0), var(--kb-start-y, 0));
          }
          100% {
            transform: scale(var(--kb-end-scale, 1.1)) translate(var(--kb-end-x, 0), var(--kb-end-y, 0));
          }
        }
      `}</style>

      <AnimatePresence mode="wait">
        <motion.div
          key={src}
          {...variants}
          className="absolute inset-0 flex items-center justify-center"
        >
          <img
            src={src}
            alt={alt}
            onLoad={handleLoad}
            className={`
              max-w-full max-h-full w-auto h-auto object-contain
              transition-opacity duration-300
              ${isLoaded ? 'opacity-100' : 'opacity-0'}
            `}
            style={animationStyle}
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Loading spinner */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * CinematicViewer - Full-screen cinematic presentation mode
 *
 * A premium, immersive viewing experience for photo galleries with:
 * - Edge-to-edge full-screen display
 * - Elegant Ken Burns animations
 * - Auto-hiding UI controls
 * - Multiple transition effects
 * - Full keyboard and touch support
 *
 * @example
 * ```tsx
 * <CinematicViewer
 *   isOpen={showCinematic}
 *   onClose={() => setShowCinematic(false)}
 *   assets={galleryAssets}
 *   initialIndex={0}
 *   getAssetUrl={getSignedUrl}
 *   galleryTitle="Wedding Collection"
 * />
 * ```
 */
export const CinematicViewer: React.FC<CinematicViewerProps> = ({
  isOpen,
  onClose,
  assets,
  initialIndex = 0,
  onIndexChange,
  getAssetUrl,
  settings: initialSettings,
  musicUrl,
  galleryTitle,
  branding,
  className = '',
}) => {
  // Settings state
  const [settings, setSettings] = useState<CinematicViewerSettings>(() => ({
    ...defaultSettings,
    ...initialSettings,
    kenBurns: { ...defaultSettings.kenBurns, ...initialSettings?.kenBurns },
    audio: { ...defaultSettings.audio, ...initialSettings?.audio },
  }));

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Detect reduced motion preference
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    []
  );

  // Use slideshow hook for timing and Ken Burns
  const slideshow = useLightboxSlideshow({
    enabled: isOpen,
    currentIndex,
    totalAssets: assets.length,
    onNavigate: (index) => {
      setCurrentIndex(index);
      onIndexChange?.(index);
    },
    settings: {
      interval: settings.interval,
      loop: settings.loop,
      hideUI: settings.autoHideUI,
      kenBurns: {
        enabled: settings.kenBurns.enabled && !prefersReducedMotion,
        minZoom: 1.0,
        maxZoom: 1.0 + settings.kenBurns.intensity * 0.2,
        randomDirection: true,
      },
    },
    onComplete: () => {
      if (!settings.loop) {
        onClose();
      }
    },
  });

  // Current asset
  const currentAsset = assets[currentIndex];
  const previewUrl = currentAsset ? getAssetUrl(currentAsset.asset_id, 'preview') : undefined;
  const isVideo = currentAsset?.asset?.type === 'video' || currentAsset?.asset?.mime_type?.startsWith('video/');

  // Update settings
  const updateSettings = useCallback((updates: Partial<CinematicViewerSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
      kenBurns: { ...prev.kenBurns, ...updates.kenBurns },
      audio: { ...prev.audio, ...updates.audio },
    }));
  }, []);

  // Auto-hide controls logic
  useEffect(() => {
    if (!isOpen) return;

    const hideControls = () => {
      if (settings.autoHideUI && slideshow.isPlaying && !showSettings) {
        setShowControls(false);
      }
    };

    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(hideControls, settings.autoHideDelay);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, settings.autoHideUI, settings.autoHideDelay, slideshow.isPlaying, showSettings, isOpen]);

  // Show controls on mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for handled keys
      switch (e.key) {
        case ' ':
          e.preventDefault();
          slideshow.toggle();
          setShowControls(true);
          break;
        case 'Escape':
          if (showSettings) {
            setShowSettings(false);
          } else if (showThumbnails) {
            setShowThumbnails(false);
          } else {
            onClose();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          slideshow.nextSlide();
          setShowControls(true);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          slideshow.prevSlide();
          setShowControls(true);
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          onIndexChange?.(0);
          setShowControls(true);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex(assets.length - 1);
          onIndexChange?.(assets.length - 1);
          setShowControls(true);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          setShowThumbnails((prev) => !prev);
          setShowControls(true);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          updateSettings({ audio: { ...settings.audio, muted: !settings.audio.muted } });
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSettings, showThumbnails, slideshow, assets.length, onClose, onIndexChange, settings.audio, updateSettings]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Touch/swipe handling for mobile
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;

    // Swipe detection
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 500) {
      if (deltaX > 0) {
        slideshow.prevSlide();
      } else {
        slideshow.nextSlide();
      }
    }

    // Tap to toggle controls
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 200) {
      setShowControls((prev) => !prev);
    }

    touchStartRef.current = null;
  }, [slideshow]);

  // Start slideshow on open
  useEffect(() => {
    if (isOpen) {
      slideshow.play();
      setCurrentIndex(initialIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle background audio
  useEffect(() => {
    if (!musicUrl || !settings.audio.enabled) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(musicUrl);
      audioRef.current.loop = true;
    }

    audioRef.current.volume = settings.audio.volume;
    audioRef.current.muted = settings.audio.muted;

    if (isOpen && slideshow.isPlaying) {
      audioRef.current.play().catch(() => {
        // Autoplay may be blocked
      });
    } else {
      audioRef.current.pause();
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [musicUrl, settings.audio, isOpen, slideshow.isPlaying]);

  if (!isOpen || !currentAsset) return null;

  const viewer = (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[9999] bg-black ${className}`}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={`Cinematic viewer: ${galleryTitle || 'Gallery'}`}
    >
      {/* Main Image Display */}
      {previewUrl && !isVideo && (
        <CinematicImage
          src={previewUrl}
          alt={currentAsset.asset.filename || `Photo ${currentIndex + 1}`}
          kenBurnsTransform={slideshow.kenBurnsTransform}
          transition={settings.transition}
          duration={settings.interval}
          isKenBurnsEnabled={settings.kenBurns.enabled && settings.transition === 'kenburns'}
          prefersReducedMotion={prefersReducedMotion}
        />
      )}

      {/* Video Display */}
      {isVideo && previewUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <video
            src={previewUrl}
            className="max-w-full max-h-full object-contain"
            controls={false}
            autoPlay
            muted={settings.audio.muted}
            loop
          />
        </div>
      )}

      {/* Progress Bar */}
      {settings.showProgress && !isVideo && (
        <ProgressBar
          progress={slideshow.progress}
          isPlaying={slideshow.isPlaying}
          color={branding?.primaryColor || 'white'}
        />
      )}

      {/* Thumbnail Strip */}
      <ThumbnailStrip
        assets={assets}
        currentIndex={currentIndex}
        onSelect={(index) => {
          setCurrentIndex(index);
          onIndexChange?.(index);
          slideshow.stop();
          slideshow.play();
        }}
        getAssetUrl={getAssetUrl}
        visible={showThumbnails}
      />

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none"
          >
            {/* Top Bar - Header */}
            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
              <div className="flex items-center justify-between">
                {/* Left - Branding & Title */}
                <div className="flex items-center gap-4">
                  {branding?.logoUrl && (
                    <img
                      src={branding.logoUrl}
                      alt={branding.name || 'Logo'}
                      className="h-8 sm:h-10 w-auto object-contain"
                    />
                  )}
                  <div>
                    {galleryTitle && (
                      <h1 className="text-white font-medium text-lg sm:text-xl">{galleryTitle}</h1>
                    )}
                    {settings.showCounter && (
                      <p className="text-white/60 text-sm">
                        {currentIndex + 1} of {assets.length}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right - Close Button */}
                <AppButton
                  variant="glass"
                  size="icon"
                  onClick={onClose}
                  className="text-white"
                  aria-label="Close cinematic view"
                >
                  <X size={24} />
                </AppButton>
              </div>
            </div>

            {/* Side Navigation Arrows */}
            {assets.length > 1 && (
              <>
                <button
                  onClick={() => {
                    slideshow.prevSlide();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/30 hover:bg-black/50 text-white rounded-full border border-white/10 transition-all pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={28} />
                </button>

                <button
                  onClick={() => {
                    slideshow.nextSlide();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/30 hover:bg-black/50 text-white rounded-full border border-white/10 transition-all pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Next photo"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-auto">
              <div className="flex items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6">
                {/* Skip Back */}
                <AppButton
                  variant="glass"
                  size="icon"
                  onClick={() => {
                    setCurrentIndex(0);
                    onIndexChange?.(0);
                  }}
                  className="text-white hidden sm:flex"
                  aria-label="Go to first"
                >
                  <SkipBack size={20} />
                </AppButton>

                {/* Previous */}
                <AppButton
                  variant="glass"
                  size="icon"
                  onClick={() => slideshow.prevSlide()}
                  className="text-white"
                  aria-label="Previous"
                >
                  <ChevronLeft size={24} />
                </AppButton>

                {/* Play/Pause */}
                <AppButton
                  variant="glass"
                  size="lg"
                  onClick={() => slideshow.toggle()}
                  className="text-white w-14 h-14 rounded-full"
                  aria-label={slideshow.isPlaying ? 'Pause' : 'Play'}
                >
                  {slideshow.isPlaying ? <Pause size={28} /> : <Play size={28} />}
                </AppButton>

                {/* Next */}
                <AppButton
                  variant="glass"
                  size="icon"
                  onClick={() => slideshow.nextSlide()}
                  className="text-white"
                  aria-label="Next"
                >
                  <ChevronRight size={24} />
                </AppButton>

                {/* Skip Forward */}
                <AppButton
                  variant="glass"
                  size="icon"
                  onClick={() => {
                    setCurrentIndex(assets.length - 1);
                    onIndexChange?.(assets.length - 1);
                  }}
                  className="text-white hidden sm:flex"
                  aria-label="Go to last"
                >
                  <SkipForward size={20} />
                </AppButton>

                {/* Right-side controls */}
                <div className="absolute right-4 sm:right-6 flex items-center gap-2">
                  {/* Thumbnails Toggle */}
                  <AppButton
                    variant="glass"
                    size="icon"
                    onClick={() => setShowThumbnails((prev) => !prev)}
                    className={`text-white ${showThumbnails ? 'bg-white/20' : ''}`}
                    aria-label={showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'}
                  >
                    <Grid size={20} />
                  </AppButton>

                  {/* Volume Control (when music available) */}
                  {musicUrl && (
                    <AppButton
                      variant="glass"
                      size="icon"
                      onClick={() => updateSettings({ audio: { ...settings.audio, muted: !settings.audio.muted } })}
                      className="text-white"
                      aria-label={settings.audio.muted ? 'Unmute' : 'Mute'}
                    >
                      {settings.audio.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </AppButton>
                  )}

                  {/* Fullscreen Toggle */}
                  <AppButton
                    variant="glass"
                    size="icon"
                    onClick={toggleFullscreen}
                    className="text-white hidden sm:flex"
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  </AppButton>

                  {/* Settings */}
                  <AppButton
                    variant="glass"
                    size="icon"
                    onClick={() => setShowSettings((prev) => !prev)}
                    className={`text-white ${showSettings ? 'bg-white/20' : ''}`}
                    aria-label="Settings"
                  >
                    <Settings2 size={20} />
                  </AppButton>
                </div>
              </div>
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <SettingsPanel
                  settings={settings}
                  onUpdate={updateSettings}
                  onClose={() => setShowSettings(false)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paused indicator (when controls hidden) */}
      <AnimatePresence>
        {!showControls && !slideshow.isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-black/50 rounded-full p-8 backdrop-blur-sm">
              <Pause size={56} className="text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return createPortal(viewer, document.body);
};

export default CinematicViewer;
