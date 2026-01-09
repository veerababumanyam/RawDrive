/**
 * EmbeddedTikTok Component
 *
 * Embeds a TikTok user profile with their latest videos.
 * Uses TikTok's oEmbed API or profile embed.
 */

import { useState } from 'react';
import { ExternalLink, Music } from 'lucide-react';

interface EmbeddedTikTokProps {
  /** TikTok username (without @) */
  username: string;
  /** Optional custom class name */
  className?: string;
}

export function EmbeddedTikTok({ username, className = '' }: EmbeddedTikTokProps) {
  const [hasError, setHasError] = useState(false);

  // Clean username (remove @ if present)
  const cleanUsername = username.replace(/^@/, '');
  const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;

  // TikTok doesn't have a direct embed for user profiles like Instagram,
  // so we'll show a styled link card to their profile
  if (hasError) {
    return null;
  }

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}>
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 p-4 bg-black text-white hover:bg-gray-900 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 via-pink-500 to-red-500 flex items-center justify-center">
          <Music className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">@{cleanUsername}</div>
          <div className="text-sm text-gray-400">View TikTok Profile</div>
        </div>
        <ExternalLink className="w-5 h-5 text-gray-400" />
      </a>
    </div>
  );
}

export default EmbeddedTikTok;
