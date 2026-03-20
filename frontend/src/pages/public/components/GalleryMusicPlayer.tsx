/**
 * GalleryMusicPlayer - Audio player with play/pause/volume controls.
 *
 * Fixed-bottom mini player bar for gallery background music.
 * Uses HTML5 Audio API. Autoplay is disabled per Web Audio API best practices.
 * User must explicitly click play to start audio.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Minimize2, Maximize2 } from 'lucide-react';

interface GalleryMusicPlayerProps {
  musicUrl?: string;
  trackName?: string;
}

/**
 * Derive a display-friendly track name from a URL.
 * Extracts the filename without extension.
 */
function deriveTrackName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop() || 'Unknown Track';
    // Remove extension
    return filename.replace(/\.[^.]+$/, '');
  } catch {
    return 'Background Music';
  }
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const GalleryMusicPlayer: React.FC<GalleryMusicPlayerProps> = ({
  musicUrl,
  trackName,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Don't render if no URL
  if (!musicUrl) return null;

  const displayName = trackName || deriveTrackName(musicUrl);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Audio playback failed:', err);
      }
    }
  }, [isPlaying]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      audio.currentTime = ratio * duration;
    },
    [duration]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      if (val > 0) setIsMuted(false);
    },
    []
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95
        backdrop-blur-sm border-t border-gray-200 dark:border-gray-700
        shadow-lg transition-all duration-300"
      data-testid="gallery-music-player"
    >
      <audio ref={audioRef} src={musicUrl} preload="metadata" />

      {isMinimized ? (
        /* Minimized view - just play/pause + expand */
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            ) : (
              <Play className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            )}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate mx-2">
            {displayName}
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            aria-label="Expand player"
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Maximize2 className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      ) : (
        /* Full view */
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800
                transition-colors flex-shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              ) : (
                <Play className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              )}
            </button>

            {/* Track info + progress */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {displayName}
                </span>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer"
                onClick={handleProgressClick}
                role="progressbar"
                aria-valuenow={Math.round(progressPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-gray-600 dark:bg-gray-400 rounded-full transition-[width] duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-gray-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-gray-500" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="w-16 h-1 accent-gray-600 dark:accent-gray-400"
              />
            </div>

            {/* Minimize */}
            <button
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize player"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <Minimize2 className="w-3 h-3 text-gray-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryMusicPlayer;
