/**
 * LightboxSlideshow Component
 * Slideshow view with Ken Burns effect (subtle zoom/pan animation)
 * Auto-advances through images with configurable timing
 */

import React, { useEffect, useState, useCallback, useMemo, CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, X, Settings2, RotateCcw } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import type { GalleryAssetItem } from '../../../types/gallery';
import { useLightboxSlideshow, type KenBurnsTransform, type SlideshowSettings } from '../../../hooks/lightbox/useLightboxSlideshow';

export interface LightboxSlideshowProps {
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Current asset index */
  currentIndex: number;
  /** Callback when index changes */
  onNavigate: (index: number) => void;
  /** Callback to exit slideshow mode */
  onExit: () => void;
  /** Function to get preview URL for an asset */
  getPreviewUrl: (assetId: string) => string | undefined;
  /** Initial slideshow settings */
  settings?: Partial<SlideshowSettings>;
  /** Whether reduced motion is preferred */
  prefersReducedMotion?: boolean;
  /** Custom className */
  className?: string;
}

// Progress bar component
const SlideshowProgress: React.FC<{
  progress: number;
  isPlaying: boolean;
}> = ({ progress, isPlaying }) => (
  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
    <motion.div
      className="h-full bg-white"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.1, ease: 'linear' }}
    />
    {!isPlaying && (
      <div className="absolute inset-0 bg-white/10 animate-pulse" />
    )}
  </div>
);

// Settings panel component
const SlideshowSettingsPanel: React.FC<{
  settings: SlideshowSettings;
  onUpdate: (settings: Partial<SlideshowSettings>) => void;
  onClose: () => void;
}> = ({ settings, onUpdate, onClose }) => {
  const intervals = [
    { label: '3s', value: 3000 },
    { label: '5s', value: 5000 },
    { label: '7s', value: 7000 },
    { label: '10s', value: 10000 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-20 right-4 bg-black/90 backdrop-blur-sm rounded-lg p-4 min-w-[200px] border border-white/10"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium">Slideshow Settings</h3>
        <AppButton
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white/60 hover:text-white h-6 w-6"
        >
          <X size={14} />
        </AppButton>
      </div>

      {/* Interval */}
      <div className="mb-4">
        <label className="text-white/70 text-sm mb-2 block">Interval</label>
        <div className="flex gap-2">
          {intervals.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onUpdate({ interval: value })}
              className={`px-3 py-1 rounded text-sm transition-colors ${
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

      {/* Loop toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/70 text-sm">Loop</span>
        <button
          onClick={() => onUpdate({ loop: !settings.loop })}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            settings.loop ? 'bg-white' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
              settings.loop ? 'left-5 bg-black' : 'left-0.5 bg-white/60'
            }`}
          />
        </button>
      </div>

      {/* Ken Burns toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/70 text-sm">Ken Burns Effect</span>
        <button
          onClick={() => onUpdate({ kenBurns: { ...settings.kenBurns, enabled: !settings.kenBurns.enabled } })}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            settings.kenBurns.enabled ? 'bg-white' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
              settings.kenBurns.enabled ? 'left-5 bg-black' : 'left-0.5 bg-white/60'
            }`}
          />
        </button>
      </div>

      {/* Hide UI toggle */}
      <div className="flex items-center justify-between">
        <span className="text-white/70 text-sm">Auto-hide controls</span>
        <button
          onClick={() => onUpdate({ hideUI: !settings.hideUI })}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            settings.hideUI ? 'bg-white' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
              settings.hideUI ? 'left-5 bg-black' : 'left-0.5 bg-white/60'
            }`}
          />
        </button>
      </div>
    </motion.div>
  );
};

/**
 * Ken Burns image with animated zoom/pan
 */
const KenBurnsImage: React.FC<{
  src: string;
  alt: string;
  transform: KenBurnsTransform;
  duration: number;
  enabled: boolean;
  prefersReducedMotion: boolean;
}> = ({ src, alt, transform, duration, enabled, prefersReducedMotion }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset loaded state when src changes
  useEffect(() => {
    setImageLoaded(false);
  }, [src]);

  const animationStyle = useMemo((): CSSProperties => {
    if (!enabled || prefersReducedMotion) {
      return {
        transform: 'scale(1) translate(0, 0)',
      };
    }

    return {
      animation: `kenBurns ${duration}ms ease-in-out forwards`,
      // CSS custom properties for the animation
      '--kb-start-scale': transform.startScale,
      '--kb-end-scale': transform.endScale,
      '--kb-start-x': `${transform.startX}%`,
      '--kb-start-y': `${transform.startY}%`,
      '--kb-end-x': `${transform.endX}%`,
      '--kb-end-y': `${transform.endY}%`,
    } as CSSProperties;
  }, [enabled, prefersReducedMotion, duration, transform]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Ken Burns CSS animation keyframes */}
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
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <img
            src={src}
            alt={alt}
            onLoad={() => setImageLoaded(true)}
            className="max-w-full max-h-full object-contain"
            style={animationStyle}
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Loading indicator */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

/**
 * LightboxSlideshow - Full-screen slideshow with Ken Burns effect
 */
export const LightboxSlideshow: React.FC<LightboxSlideshowProps> = ({
  assets,
  currentIndex,
  onNavigate,
  onExit,
  getPreviewUrl,
  settings: initialSettings,
  prefersReducedMotion = false,
  className = '',
}) => {
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const controlsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use slideshow hook
  const slideshow = useLightboxSlideshow({
    currentIndex,
    totalAssets: assets.length,
    onNavigate,
    settings: initialSettings,
    onComplete: onExit,
  });

  // Current asset
  const currentAsset = assets[currentIndex];
  const previewUrl = currentAsset ? getPreviewUrl(currentAsset.asset_id) : undefined;

  // Auto-hide controls when playing
  useEffect(() => {
    if (slideshow.isPlaying && slideshow.settings.hideUI && !showSettings) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);

      return () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      };
    } else {
      setShowControls(true);
    }
  }, [slideshow.isPlaying, slideshow.settings.hideUI, showSettings]);

  // Show controls on mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (slideshow.isPlaying && slideshow.settings.hideUI && !showSettings) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [slideshow.isPlaying, slideshow.settings.hideUI, showSettings]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          slideshow.toggle();
          break;
        case 'Escape':
          onExit();
          break;
        case 'ArrowRight':
          slideshow.nextSlide();
          break;
        case 'ArrowLeft':
          slideshow.prevSlide();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [slideshow, onExit]);

  // Start playing when component mounts
  useEffect(() => {
    slideshow.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!currentAsset || !previewUrl) {
    return (
      <div className={`fixed inset-0 bg-black flex items-center justify-center ${className}`}>
        <div className="text-white">No images to display</div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 bg-black z-50 ${className}`}
      onMouseMove={handleMouseMove}
      onClick={() => {
        if (!showSettings) {
          slideshow.toggle();
        }
      }}
    >
      {/* Ken Burns Image */}
      <KenBurnsImage
        src={previewUrl}
        alt={currentAsset.asset.filename || `Photo ${currentIndex + 1}`}
        transform={slideshow.kenBurnsTransform}
        duration={slideshow.settings.interval}
        enabled={slideshow.settings.kenBurns.enabled}
        prefersReducedMotion={prefersReducedMotion}
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
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <span className="font-medium">{currentAsset.asset.filename || `Photo ${currentIndex + 1}`}</span>
                  <span className="text-white/60 ml-4">{currentIndex + 1} / {assets.length}</span>
                </div>
                <AppButton
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExit();
                  }}
                  className="text-white hover:bg-white/20"
                  aria-label="Exit slideshow"
                >
                  <X size={24} />
                </AppButton>
              </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto">
              {/* Progress bar */}
              <SlideshowProgress
                progress={slideshow.progress}
                isPlaying={slideshow.isPlaying}
              />

              {/* Control buttons */}
              <div className="flex items-center justify-center gap-4 p-4">
                <AppButton
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    slideshow.prevSlide();
                  }}
                  className="text-white hover:bg-white/20"
                  aria-label="Previous slide"
                >
                  <SkipBack size={24} />
                </AppButton>

                <AppButton
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    slideshow.toggle();
                  }}
                  className="text-white hover:bg-white/20 w-14 h-14"
                  aria-label={slideshow.isPlaying ? 'Pause' : 'Play'}
                >
                  {slideshow.isPlaying ? <Pause size={32} /> : <Play size={32} />}
                </AppButton>

                <AppButton
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    slideshow.nextSlide();
                  }}
                  className="text-white hover:bg-white/20"
                  aria-label="Next slide"
                >
                  <SkipForward size={24} />
                </AppButton>

                <div className="absolute right-4 flex gap-2">
                  <AppButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      slideshow.stop();
                      onNavigate(0);
                    }}
                    className="text-white hover:bg-white/20"
                    aria-label="Restart slideshow"
                  >
                    <RotateCcw size={20} />
                  </AppButton>

                  <AppButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettings(!showSettings);
                    }}
                    className={`text-white hover:bg-white/20 ${showSettings ? 'bg-white/20' : ''}`}
                    aria-label="Slideshow settings"
                  >
                    <Settings2 size={20} />
                  </AppButton>
                </div>
              </div>
            </div>

            {/* Settings panel */}
            <AnimatePresence>
              {showSettings && (
                <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                  <SlideshowSettingsPanel
                    settings={slideshow.settings}
                    onUpdate={slideshow.updateSettings}
                    onClose={() => setShowSettings(false)}
                  />
                </div>
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
            <div className="bg-black/50 rounded-full p-6">
              <Pause size={48} className="text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LightboxSlideshow;
