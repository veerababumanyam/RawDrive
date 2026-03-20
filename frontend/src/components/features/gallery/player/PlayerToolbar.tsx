/**
 * PlayerToolbar
 * Top toolbar for the GalleryPlayer with position counter, info toggle,
 * optional download button, and close button.
 * Uses glassmorphism styling consistent with existing lightbox buttons.
 */
import React from 'react';
import { X, Info, Download, Heart, MessageCircle } from 'lucide-react';

export interface PlayerToolbarProps {
  /** Position label e.g. "3 / 25" */
  positionLabel: string;
  /** Close the player */
  onClose: () => void;
  /** Toggle EXIF/info panel */
  onToggleInfo: () => void;
  /** Whether info panel is currently active */
  showInfoActive: boolean;
  /** Optional download handler */
  onDownload?: () => void;
  /** Download policy — hide download button for 'view_only' */
  downloadPolicy?: string;
  /** Whether a download is in progress */
  isDownloading?: boolean;
  /** Auto-hide hover handlers */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Current asset ID for favorite button */
  currentAssetId?: string;
  /** Whether the current asset is favorited */
  isFavorited?: boolean;
  /** Toggle favorite handler */
  onToggleFavorite?: () => void;
  /** Toggle comment panel handler */
  onToggleComments?: () => void;
  /** Whether comment panel is open */
  showCommentsActive?: boolean;
}

export const PlayerToolbar: React.FC<PlayerToolbarProps> = ({
  positionLabel,
  onClose,
  onToggleInfo,
  showInfoActive,
  onDownload,
  downloadPolicy,
  isDownloading,
  onMouseEnter,
  onMouseLeave,
  isFavorited,
  onToggleFavorite,
  onToggleComments,
  showCommentsActive,
}) => {
  const showDownload = downloadPolicy !== 'view_only' && onDownload;

  return (
    <div
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Gradient scrim for contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* Position counter */}
      <div className="relative z-10 text-white/90 text-sm font-medium select-none">
        {positionLabel}
      </div>

      {/* Action buttons */}
      <div className="relative z-10 flex items-center gap-2">
        {onToggleFavorite && (
          <button
            className={`w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 transition-all ${isFavorited ? 'text-red-500 bg-white/20' : 'text-white/90 hover:bg-white/20'}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={18} fill={isFavorited ? 'currentColor' : 'none'} />
          </button>
        )}

        <button
          className={`w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all ${showInfoActive ? 'bg-white/25 ring-1 ring-white/40' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleInfo(); }}
          aria-label="Toggle info"
        >
          <Info size={18} />
        </button>

        {onToggleComments && (
          <button
            className={`w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all ${showCommentsActive ? 'bg-white/25 ring-1 ring-white/40' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleComments(); }}
            aria-label="Toggle comments"
          >
            <MessageCircle size={18} />
          </button>
        )}

        {showDownload && (
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all"
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            disabled={isDownloading}
            aria-label="Download"
          >
            <Download size={18} className={isDownloading ? 'animate-pulse' : ''} />
          </button>
        )}

        <button
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};
