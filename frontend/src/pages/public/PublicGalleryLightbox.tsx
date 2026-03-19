/**
 * Public Gallery Lightbox
 * Extracted from PublicGalleryPage monolith. Handles photo/video viewing,
 * zoom, swipe navigation, keyboard shortcuts, EXIF info, and watermarks.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Download, X, Heart, Bookmark, ChevronLeft, ChevronRight,
  Camera, Info, Play, Pause, Volume2, VolumeX, Video, Keyboard,
} from 'lucide-react';
import type { PublicGalleryAsset, GalleryDetailData } from '../../types/gallery';
import { useGalleryInteraction } from '../../contexts/GalleryInteractionContext';

interface PublicGalleryLightboxProps {
  asset: PublicGalleryAsset;
  index: number;
  total: number;
  gallery: GalleryDetailData;
  displayedAssets: PublicGalleryAsset[];
  companyName?: string;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDownload: (asset: PublicGalleryAsset) => void;
  isDownloading: boolean;
}

export const PublicGalleryLightbox: React.FC<PublicGalleryLightboxProps> = ({
  asset, index, total, gallery, displayedAssets, companyName,
  onClose, onNavigate, onDownload, isDownloading,
}) => {
  const { favorites, selections, toggleFavorite, toggleSelection } = useGalleryInteraction();

  const [showExif, setShowExif] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const lightboxRef = React.useRef<HTMLDivElement>(null);
  const lastTapRef = React.useRef<number>(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Reset state on asset change
  useEffect(() => {
    setShowExif(false);
    setIsVideoPlaying(false);
    setIsZoomed(false);
    setZoomPosition({ x: 50, y: 50 });
  }, [asset.asset_id]);

  const toggleVideoPlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (isVideoPlaying) videoRef.current.pause(); else videoRef.current.play();
    setIsVideoPlaying(!isVideoPlaying);
  }, [isVideoPlaying]);

  const toggleVideoMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isVideoMuted;
    setIsVideoMuted(!isVideoMuted);
  }, [isVideoMuted]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    const now = Date.now();
    if (dt < 200 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      if (now - lastTapRef.current < 300) {
        if (asset.type !== 'video') {
          setIsZoomed(p => !p);
          const rect = lightboxRef.current?.getBoundingClientRect();
          if (rect) setZoomPosition({ x: ((touch.clientX - rect.left) / rect.width) * 100, y: ((touch.clientY - rect.top) / rect.height) * 100 });
        }
        lastTapRef.current = 0; touchStartRef.current = null; return;
      }
      lastTapRef.current = now;
    }
    touchStartRef.current = null;
    if (isZoomed || dt > 300) return;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 50 && ax > ay * 0.5) { onNavigate(dx > 0 ? 'prev' : 'next'); return; }
    if (ay > 50 && ay > ax * 0.5 && dy < 0) onClose();
  }, [onNavigate, onClose, isZoomed, asset.type]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowLeft': onNavigate('prev'); break;
        case 'ArrowRight': onNavigate('next'); break;
        case 'f': case 'F': toggleFavorite(asset.asset_id); break;
        case 's': case 'S': toggleSelection(asset.asset_id); break;
        case 'i': case 'I': if (gallery.exif_visible) setShowExif(p => !p); break;
        case 'd': case 'D': if (gallery.download_policy !== 'view_only') onDownload(asset); break;
        case ' ': if (asset.type === 'video') { e.preventDefault(); toggleVideoPlayback(); } break;
        case 'm': case 'M': if (asset.type === 'video') toggleVideoMute(); break;
        case '?': e.preventDefault(); setShowKeyboardHelp(true); break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [asset, onClose, onNavigate, onDownload, toggleFavorite, toggleSelection, gallery, toggleVideoPlayback, toggleVideoMute]);

  const previewUrl = `/api/v1/public/galleries/${gallery.gallery_id}/assets/${asset.asset_id}/preview`;
  const isFav = favorites.has(asset.asset_id);
  const isSel = selections.has(asset.asset_id);
  const caption = asset.caption || asset.ai_caption || asset.metadata?.caption || asset.metadata?.ai_caption;
  const showWatermark = gallery.download_policy === 'view_only' || gallery.download_policy === 'watermarked_only';

  return (
    <div ref={lightboxRef} className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none" onClick={onClose} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} role="dialog" aria-modal="true" aria-label="Photo viewer">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-white/80 text-sm"><span>{index + 1} / {total}</span></div>
        <div className="flex items-center gap-2">
          {gallery.exif_visible && asset.metadata && (
            <button className={`p-2 rounded-full transition-colors ${showExif ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`} onClick={(e) => { e.stopPropagation(); setShowExif(!showExif); }} aria-label="Toggle photo info"><Info size={24} /></button>
          )}
          {gallery.download_policy !== 'view_only' && (
            <button className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-50" onClick={(e) => { e.stopPropagation(); onDownload(asset); }} disabled={isDownloading} aria-label="Download"><Download size={24} className={isDownloading ? 'animate-pulse' : ''} /></button>
          )}
          <button className="p-2 text-white/60 hover:text-white transition-colors" onClick={onClose} aria-label="Close"><X size={28} /></button>
        </div>
      </div>

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white rounded-full transition-all backdrop-blur-sm z-10" onClick={(e) => { e.stopPropagation(); onNavigate('prev'); }} aria-label="Previous"><ChevronLeft size={32} /></button>
          <button className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white rounded-full transition-all backdrop-blur-sm z-10" onClick={(e) => { e.stopPropagation(); onNavigate('next'); }} aria-label="Next"><ChevronRight size={32} /></button>
        </>
      )}

      {/* Main media */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {asset.type === 'video' ? (
          <>
            <video ref={videoRef} src={previewUrl} className="max-w-[90vw] max-h-[85vh] object-contain" controls={false} playsInline onPlay={() => setIsVideoPlaying(true)} onPause={() => setIsVideoPlaying(false)} onEnded={() => setIsVideoPlaying(false)} onClick={toggleVideoPlayback} />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
              <button className="p-2 text-white/80 hover:text-white" onClick={(e) => { e.stopPropagation(); toggleVideoPlayback(); }} aria-label={isVideoPlaying ? 'Pause' : 'Play'}>{isVideoPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
              <button className="p-2 text-white/80 hover:text-white" onClick={(e) => { e.stopPropagation(); toggleVideoMute(); }} aria-label={isVideoMuted ? 'Unmute' : 'Mute'}>{isVideoMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
            </div>
            {!isVideoPlaying && <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleVideoPlayback}><div className="p-4 bg-black/50 backdrop-blur-sm rounded-full"><Play size={48} className="text-white" /></div></div>}
          </>
        ) : (
          <div className={`relative overflow-hidden ${isZoomed ? 'cursor-move' : 'cursor-zoom-in'}`} style={{ maxWidth: '90vw', maxHeight: '85vh' }}>
            <img src={previewUrl} alt={asset.filename} className="max-w-[90vw] max-h-[85vh] object-contain transition-transform duration-200"
              style={isZoomed ? { transform: 'scale(2.5)', transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%` } : undefined}
              onDoubleClick={(e) => { setIsZoomed(p => !p); const r = e.currentTarget.getBoundingClientRect(); setZoomPosition({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
              onMouseMove={(e) => { if (isZoomed) { const r = e.currentTarget.getBoundingClientRect(); setZoomPosition({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); } }}
            />
          </div>
        )}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-white/15 text-4xl md:text-6xl font-bold uppercase tracking-widest rotate-[-25deg] whitespace-nowrap" style={{ textShadow: '0 0 20px rgba(0,0,0,0.5)', letterSpacing: '0.15em' }}>{companyName || 'PREVIEW ONLY'}</div>
          </div>
        )}
        {caption && <div className="absolute -bottom-12 left-0 right-0 text-center px-4"><p className="text-white/90 text-sm md:text-base max-w-2xl mx-auto line-clamp-2">{caption}</p></div>}
      </div>

      {/* Info Panel */}
      {showExif && (asset.metadata || asset.type === 'video') && (
        <div className="absolute right-4 top-20 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white text-sm max-w-xs z-10" onClick={(e) => e.stopPropagation()}>
          <h4 className="font-semibold mb-3 flex items-center gap-2">{asset.type === 'video' ? <><Video size={16} />Video Info</> : <><Camera size={16} />Photo Info</>}</h4>
          <div className="space-y-2 text-white/80">
            {asset.type === 'video' && asset.duration && <div className="flex justify-between"><span className="text-white/60">Duration</span><span>{Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}</span></div>}
            {asset.type !== 'video' && asset.metadata?.make && <div className="flex justify-between"><span className="text-white/60">Camera</span><span>{asset.metadata.make} {asset.metadata.model || ''}</span></div>}
            {asset.type !== 'video' && asset.metadata?.lens && <div className="flex justify-between"><span className="text-white/60">Lens</span><span>{asset.metadata.lens}</span></div>}
            {asset.type !== 'video' && asset.metadata?.focal_length && <div className="flex justify-between"><span className="text-white/60">Focal Length</span><span>{asset.metadata.focal_length}mm</span></div>}
            {asset.type !== 'video' && asset.metadata?.aperture && <div className="flex justify-between"><span className="text-white/60">Aperture</span><span>f/{asset.metadata.aperture}</span></div>}
            {asset.type !== 'video' && asset.metadata?.shutter_speed && <div className="flex justify-between"><span className="text-white/60">Shutter</span><span>{asset.metadata.shutter_speed}</span></div>}
            {asset.type !== 'video' && asset.metadata?.iso && <div className="flex justify-between"><span className="text-white/60">ISO</span><span>{asset.metadata.iso}</span></div>}
            {asset.width && asset.height && <div className="flex justify-between"><span className="text-white/60">Resolution</span><span>{asset.width} x {asset.height}</span></div>}
            {asset.metadata?.date_taken && <div className="flex justify-between"><span className="text-white/60">Date Taken</span><span>{new Date(asset.metadata.date_taken).toLocaleDateString()}</span></div>}
          </div>
          {caption && <div className="mt-3 pt-3 border-t border-white/20"><span className="text-white/60 text-xs uppercase tracking-wider">Caption</span><p className="text-white/90 text-sm mt-1">{caption}</p></div>}
          {(asset.ai_tags?.length || asset.metadata?.ai_tags?.length || asset.metadata?.tags?.length) && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <span className="text-white/60 text-xs uppercase tracking-wider">Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-2">{(asset.ai_tags || asset.metadata?.ai_tags || asset.metadata?.tags || []).slice(0, 8).map((tag: string, i: number) => <span key={i} className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/80">{tag}</span>)}</div>
            </div>
          )}
          <p className="mt-3 pt-3 border-t border-white/20 text-white/50 text-xs">Press I to toggle</p>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 z-10">
        <button className={`p-3 rounded-full backdrop-blur-sm transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(asset.asset_id); }} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
          <Heart size={24} className={isFav ? 'fill-current' : ''} />
        </button>
        <button className={`p-3 rounded-full backdrop-blur-sm transition-all ${isSel ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`} onClick={(e) => { e.stopPropagation(); toggleSelection(asset.asset_id); }} aria-label={isSel ? 'Remove from picks' : 'Add to picks'}>
          <Bookmark size={24} className={isSel ? 'fill-current' : ''} />
        </button>
      </div>

      <div className="absolute bottom-4 right-4 text-white/40 text-xs hidden md:block">
        &larr; &rarr; Navigate | F Favorite | S Select{gallery.download_policy !== 'view_only' ? ' | D Download' : ''} | I Info{asset.type === 'video' ? ' | Space Play/Pause | M Mute' : ''} | ? Help | Esc Close
      </div>
      <div className="absolute bottom-4 left-4 right-4 text-white/40 text-xs text-center md:hidden">
        {asset.type !== 'video' && 'Double-tap to zoom | '}Swipe left/right to navigate | Swipe up to close
      </div>

      {/* Keyboard shortcuts help */}
      {showKeyboardHelp && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowKeyboardHelp(false)} role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Keyboard size={20} />Keyboard Shortcuts</h2>
              <button onClick={() => setShowKeyboardHelp(false)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Navigation</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">&larr;</kbd><span className="text-gray-700 dark:text-gray-300">Previous</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">&rarr;</kbd><span className="text-gray-700 dark:text-gray-300">Next</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Esc</kbd><span className="text-gray-700 dark:text-gray-300">Close</span></div>
              </div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Actions</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">F</kbd><span className="text-gray-700 dark:text-gray-300">Favorite</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">S</kbd><span className="text-gray-700 dark:text-gray-300">Select</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">I</kbd><span className="text-gray-700 dark:text-gray-300">Info</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">D</kbd><span className="text-gray-700 dark:text-gray-300">Download</span></div>
              </div>
              {asset.type === 'video' && (<><h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Video</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Space</kbd><span className="text-gray-700 dark:text-gray-300">Play/Pause</span></div>
                <div className="flex items-center gap-2"><kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">M</kbd><span className="text-gray-700 dark:text-gray-300">Mute</span></div>
              </div></>)}
            </div>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">?</kbd> anytime</p>
          </div>
        </div>
      )}
    </div>
  );
};
