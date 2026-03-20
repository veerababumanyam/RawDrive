/**
 * PlayerFilmstrip
 * Horizontal scrolling thumbnail strip at the bottom of the GalleryPlayer.
 * Shows all gallery assets with the current photo highlighted and auto-scrolled into view.
 */
import React, { useRef, useEffect } from 'react';
import { useGalleryPlayer } from '../../../../contexts/GalleryPlayerContext';

export const PlayerFilmstrip: React.FC = () => {
  const { assets, currentIndex, openPlayer } = useGalleryPlayer();
  const activeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active thumbnail into view on currentIndex change
  useEffect(() => {
    if (activeRef.current && typeof activeRef.current.scrollIntoView === 'function') {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentIndex]);

  if (assets.length === 0) return null;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 bg-black/60 backdrop-blur-sm"
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div
        ref={containerRef}
        className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {assets.map((asset, index) => {
          const isActive = index === currentIndex;
          const previewUrl = `/api/v1/public/galleries/${asset.gallery_id}/assets/${asset.asset_id}/preview`;

          return (
            <button
              key={asset.asset_id}
              ref={isActive ? activeRef : undefined}
              className={`
                flex-shrink-0 w-14 h-14 rounded overflow-hidden transition-all duration-200
                ${isActive
                  ? 'ring-2 ring-white scale-110 opacity-100'
                  : 'opacity-60 hover:opacity-100 ring-0'
                }
              `}
              onClick={(e) => {
                e.stopPropagation();
                openPlayer(index);
              }}
              aria-label={`View ${asset.filename}`}
              aria-current={isActive ? 'true' : undefined}
            >
              <img
                src={previewUrl}
                alt={asset.filename}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
