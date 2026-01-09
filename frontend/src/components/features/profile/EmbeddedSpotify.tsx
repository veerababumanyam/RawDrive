/**
 * EmbeddedSpotify Component
 *
 * Embeds a Spotify playlist player using Spotify's oEmbed iframe.
 */

import { useState } from 'react';
import { Music } from 'lucide-react';

interface EmbeddedSpotifyProps {
  /** Spotify playlist ID */
  playlistId: string;
  /** Optional height of the embed (default: 152 for compact view) */
  height?: number;
  /** Show full playlist (352px) or compact view (152px) */
  compact?: boolean;
  /** Optional custom class name */
  className?: string;
  /** Theme: 0 = colorful (default), 1 = dark */
  theme?: 0 | 1;
}

export function EmbeddedSpotify({
  playlistId,
  height,
  compact = true,
  className = '',
  theme = 0,
}: EmbeddedSpotifyProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Clean playlist ID (extract from URL if full URL provided)
  let cleanPlaylistId = playlistId;
  if (playlistId.includes('spotify.com')) {
    const match = playlistId.match(/playlist\/([a-zA-Z0-9]+)/);
    if (match) {
      cleanPlaylistId = match[1];
    }
  }

  // Calculate embed height
  const embedHeight = height || (compact ? 152 : 352);

  // Spotify embed URL
  const embedUrl = `https://open.spotify.com/embed/playlist/${cleanPlaylistId}?utm_source=generator&theme=${theme}`;

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center gap-3 p-4 bg-black/90 text-white rounded-2xl ${className}`}
        style={{ height: embedHeight }}
      >
        <Music className="w-6 h-6 text-[#1DB954]" />
        <span className="text-sm text-gray-400">Spotify playlist unavailable</span>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}>
      {/* Loading state */}
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/90"
          style={{ height: embedHeight }}
        >
          <div className="flex items-center gap-3">
            <Music className="w-6 h-6 text-[#1DB954] animate-pulse" />
            <span className="text-sm text-gray-400">Loading playlist...</span>
          </div>
        </div>
      )}

      {/* Spotify iframe embed */}
      <iframe
        src={embedUrl}
        width="100%"
        height={embedHeight}
        frameBorder="0"
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        style={{
          borderRadius: '12px',
          display: isLoading ? 'none' : 'block',
        }}
        title="Spotify Playlist"
      />
    </div>
  );
}

export default EmbeddedSpotify;
