/**
 * AmbientDisplayPage Component
 * A beautiful, minimal ambient photo display optimized for Smart TVs.
 *
 * Features:
 * - Full-screen, edge-to-edge photo display
 * - Ken Burns animations with smooth transitions
 * - Minimal UI that auto-hides
 * - Clock and photo info overlay
 * - Offline support with cached images
 * - Power-saving considerations
 * - Remote control navigation support
 *
 * @module pages/public/AmbientDisplayPage
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  Clock,
  Image,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface AmbientPhoto {
  id: string;
  url: string;
  title?: string;
  captureDate?: string;
  aspectRatio: number;
}

interface AmbientSettings {
  interval: number;
  showClock: boolean;
  showPhotoInfo: boolean;
  kenBurnsEnabled: boolean;
  kenBurnsIntensity: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SETTINGS: AmbientSettings = {
  interval: 10000, // 10 seconds
  showClock: true,
  showPhotoInfo: true,
  kenBurnsEnabled: true,
  kenBurnsIntensity: 0.5,
};

// Simulated gallery data for demo
const DEMO_PHOTOS: AmbientPhoto[] = [
  { id: '1', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920', title: 'Mountain Sunrise', captureDate: '2024-01-15', aspectRatio: 1.5 },
  { id: '2', url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920', title: 'Forest Path', captureDate: '2024-01-16', aspectRatio: 1.5 },
  { id: '3', url: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1920', title: 'Coastal View', captureDate: '2024-01-17', aspectRatio: 1.33 },
  { id: '4', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920', title: 'Valley Morning', captureDate: '2024-01-18', aspectRatio: 1.5 },
  { id: '5', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920', title: 'Meadow Sunset', captureDate: '2024-01-19', aspectRatio: 1.5 },
];

// ============================================================================
// Hooks
// ============================================================================

/**
 * Custom hook for Ken Burns animation
 */
function useKenBurns(enabled: boolean, intensity: number) {
  const [transform, setTransform] = useState(() => generateKenBurnsTransform(intensity));

  const regenerate = useCallback(() => {
    if (enabled) {
      setTransform(generateKenBurnsTransform(intensity));
    }
  }, [enabled, intensity]);

  return { transform, regenerate };
}

function generateKenBurnsTransform(intensity: number) {
  const maxScale = 1 + intensity * 0.15;
  const maxTranslate = intensity * 5;

  return {
    startScale: 1 + Math.random() * (maxScale - 1) * 0.3,
    endScale: 1 + Math.random() * (maxScale - 1),
    startX: (Math.random() - 0.5) * maxTranslate,
    startY: (Math.random() - 0.5) * maxTranslate,
    endX: (Math.random() - 0.5) * maxTranslate,
    endY: (Math.random() - 0.5) * maxTranslate,
  };
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Clock display
 */
const ClockDisplay: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute top-8 left-8 z-10"
    >
      <div className="text-6xl font-light text-white tracking-wider drop-shadow-2xl">
        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div className="text-xl text-white/70 mt-1 drop-shadow-lg">
        {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </motion.div>
  );
};

/**
 * Photo info display
 */
const PhotoInfo: React.FC<{
  photo: AmbientPhoto;
  index: number;
  total: number;
  visible: boolean;
}> = ({ photo, index, total, visible }) => {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-8 left-8 z-10"
    >
      {photo.title && (
        <h2 className="text-2xl font-medium text-white drop-shadow-lg mb-1">
          {photo.title}
        </h2>
      )}
      {photo.captureDate && (
        <p className="text-white/60 drop-shadow-lg">
          {new Date(photo.captureDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      )}
      <div className="mt-2 text-white/40 text-sm">
        {index + 1} of {total}
      </div>
    </motion.div>
  );
};

/**
 * Settings panel
 */
const SettingsPanel: React.FC<{
  settings: AmbientSettings;
  onUpdate: (settings: Partial<AmbientSettings>) => void;
  onClose: () => void;
}> = ({ settings, onUpdate, onClose }) => {
  const intervals = [
    { label: '5s', value: 5000 },
    { label: '10s', value: 10000 },
    { label: '15s', value: 15000 },
    { label: '30s', value: 30000 },
    { label: '60s', value: 60000 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/90 backdrop-blur-xl rounded-3xl p-8 min-w-[400px] border border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-2xl font-semibold text-white">Display Settings</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-6 h-6 text-white/60" />
        </button>
      </div>

      {/* Slide duration */}
      <div className="mb-8">
        <label className="text-white/70 text-sm mb-3 block">Slide Duration</label>
        <div className="flex gap-2">
          {intervals.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onUpdate({ interval: value })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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

      {/* Toggles */}
      <div className="space-y-4">
        {/* Clock toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-white/60" />
            <span className="text-white">Show Clock</span>
          </div>
          <button
            onClick={() => onUpdate({ showClock: !settings.showClock })}
            className={`w-12 h-7 rounded-full transition-colors relative ${
              settings.showClock ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full transition-all ${
                settings.showClock ? 'left-6 bg-white' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Photo info toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image className="w-5 h-5 text-white/60" />
            <span className="text-white">Show Photo Info</span>
          </div>
          <button
            onClick={() => onUpdate({ showPhotoInfo: !settings.showPhotoInfo })}
            className={`w-12 h-7 rounded-full transition-colors relative ${
              settings.showPhotoInfo ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full transition-all ${
                settings.showPhotoInfo ? 'left-6 bg-white' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Ken Burns toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Image className="w-5 h-5 text-white/60" />
            </motion.div>
            <span className="text-white">Ken Burns Effect</span>
          </div>
          <button
            onClick={() => onUpdate({ kenBurnsEnabled: !settings.kenBurnsEnabled })}
            className={`w-12 h-7 rounded-full transition-colors relative ${
              settings.kenBurnsEnabled ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full transition-all ${
                settings.kenBurnsEnabled ? 'left-6 bg-white' : 'left-1 bg-white/60'
              }`}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const AmbientDisplayPage: React.FC = () => {
  const { galleryId } = useParams<{ galleryId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // State
  const [photos, setPhotos] = useState<AmbientPhoto[]>(DEMO_PHOTOS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [settings, setSettings] = useState<AmbientSettings>(DEFAULT_SETTINGS);

  // Refs
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideshowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ken Burns effect
  const kenBurns = useKenBurns(settings.kenBurnsEnabled, settings.kenBurnsIntensity);

  // Current photo
  const currentPhoto = photos[currentIndex];

  // Navigation handlers
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    kenBurns.regenerate();
  }, [photos.length, kenBurns]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    kenBurns.regenerate();
  }, [photos.length, kenBurns]);

  // Toggle play/pause
  const togglePlayback = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Update settings
  const updateSettings = useCallback((updates: Partial<AmbientSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Auto-advance slideshow
  useEffect(() => {
    if (!isPlaying || showSettings) return;

    slideshowIntervalRef.current = setInterval(goToNext, settings.interval);

    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
    };
  }, [isPlaying, settings.interval, goToNext, showSettings]);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls || showSettings) return;

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, showSettings]);

  // Show controls on mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Keyboard navigation (for TV remotes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setShowControls(true);

      switch (e.key) {
        case 'ArrowRight':
        case 'd':
          goToNext();
          break;
        case 'ArrowLeft':
        case 'a':
          goToPrev();
          break;
        case ' ':
        case 'Enter':
        case 'p':
          togglePlayback();
          break;
        case 's':
          setShowSettings((prev) => !prev);
          break;
        case 'Escape':
          if (showSettings) {
            setShowSettings(false);
          } else {
            navigate('/tv/activate');
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, togglePlayback, showSettings, navigate]);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Prevent screen sleep (where supported)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or failed
      }
    };

    requestWakeLock();

    return () => {
      wakeLock?.release();
    };
  }, []);

  // Ken Burns animation style
  const kenBurnsStyle = useMemo(() => {
    if (!settings.kenBurnsEnabled) return {};

    return {
      '--kb-start-scale': kenBurns.transform.startScale,
      '--kb-end-scale': kenBurns.transform.endScale,
      '--kb-start-x': `${kenBurns.transform.startX}%`,
      '--kb-start-y': `${kenBurns.transform.startY}%`,
      '--kb-end-x': `${kenBurns.transform.endX}%`,
      '--kb-end-y': `${kenBurns.transform.endY}%`,
    } as React.CSSProperties;
  }, [kenBurns.transform, settings.kenBurnsEnabled]);

  if (!currentPhoto) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/60">Loading gallery...</p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden cursor-none"
      onMouseMove={handleMouseMove}
      onClick={() => setShowControls(true)}
    >
      {/* Ken Burns CSS Animation */}
      <style>{`
        @keyframes kenBurnsAmbient {
          0% {
            transform: scale(var(--kb-start-scale, 1)) translate(var(--kb-start-x, 0), var(--kb-start-y, 0));
          }
          100% {
            transform: scale(var(--kb-end-scale, 1.1)) translate(var(--kb-end-x, 0), var(--kb-end-y, 0));
          }
        }
      `}</style>

      {/* Photo display */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPhoto.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          <img
            src={currentPhoto.url}
            alt={currentPhoto.title || ''}
            className="w-full h-full object-cover"
            style={{
              ...(settings.kenBurnsEnabled
                ? {
                    animation: `kenBurnsAmbient ${settings.interval}ms ease-in-out forwards`,
                    ...kenBurnsStyle,
                  }
                : {}),
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />

      {/* Clock display */}
      <AnimatePresence>
        {(showControls || settings.showClock) && (
          <ClockDisplay visible={settings.showClock} />
        )}
      </AnimatePresence>

      {/* Photo info */}
      <AnimatePresence>
        {(showControls || settings.showPhotoInfo) && (
          <PhotoInfo
            photo={currentPhoto}
            index={currentIndex}
            total={photos.length}
            visible={settings.showPhotoInfo}
          />
        )}
      </AnimatePresence>

      {/* Network status indicator */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-8 right-8 z-10 flex items-center gap-2 bg-orange-500/80 text-white px-4 py-2 rounded-full"
          >
            <WifiOff className="w-4 h-4" />
            <span className="text-sm">Offline</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default"
          >
            {/* Center controls */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-6">
              <button
                onClick={goToPrev}
                className="p-4 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              >
                <ChevronLeft className="w-10 h-10 text-white" />
              </button>

              <button
                onClick={togglePlayback}
                className="p-6 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-12 h-12 text-white" />
                ) : (
                  <Play className="w-12 h-12 text-white ml-1" />
                )}
              </button>

              <button
                onClick={goToNext}
                className="p-4 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              >
                <ChevronRight className="w-10 h-10 text-white" />
              </button>
            </div>

            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="absolute bottom-8 right-8 p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
            >
              <Settings className="w-6 h-6 text-white" />
            </button>

            {/* Progress indicator */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <motion.div
                className="h-full bg-white/60"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                key={currentIndex}
                transition={{ duration: settings.interval / 1000, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 z-40"
              onClick={() => setShowSettings(false)}
            />
            <SettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              onClose={() => setShowSettings(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AmbientDisplayPage;
