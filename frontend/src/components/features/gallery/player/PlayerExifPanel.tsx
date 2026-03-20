/**
 * PlayerExifPanel
 * Slide-up overlay panel displaying EXIF metadata for the current asset.
 * Positioned at bottom-right of the player, above the filmstrip.
 * Toggled via the toolbar info button or 'I' key.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Camera, Aperture, Timer, Sun, Ruler, Focus, Calendar, ImageIcon } from 'lucide-react';
import type { PublicGalleryAsset } from '../../../../types/gallery';

export interface PlayerExifPanelProps {
  /** The asset whose metadata to display */
  asset: PublicGalleryAsset;
  /** Gallery ID (for potential future use) */
  galleryId: string;
}

/**
 * Renders EXIF metadata in a slide-up overlay with blur backdrop.
 * Returns null if the asset has no displayable metadata.
 */
export const PlayerExifPanel: React.FC<PlayerExifPanelProps> = ({ asset, galleryId }) => {
  const meta = asset.metadata;
  const hasResolution = asset.width != null && asset.height != null;
  const caption = asset.caption || asset.ai_caption || meta?.caption;
  const tags: string[] = asset.ai_tags || meta?.tags || [];

  // Determine if there is any displayable content
  const hasMetadata = meta && (
    meta.make || meta.model || meta.lens || meta.focal_length != null ||
    meta.aperture != null || meta.shutter_speed || meta.iso != null || meta.date_taken
  );

  if (!hasMetadata && !hasResolution && !caption && tags.length === 0) {
    return null;
  }

  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = [];

  if (meta?.make || meta?.model) {
    const camera = [meta.make, meta.model].filter(Boolean).join(' ');
    rows.push({ icon: <Camera size={14} />, label: 'Camera', value: camera });
  }

  if (meta?.lens) {
    rows.push({ icon: <Focus size={14} />, label: 'Lens', value: meta.lens });
  }

  if (meta?.focal_length != null) {
    rows.push({ icon: <Ruler size={14} />, label: 'Focal Length', value: `${meta.focal_length}mm` });
  }

  if (meta?.aperture != null) {
    rows.push({ icon: <Aperture size={14} />, label: 'Aperture', value: `f/${meta.aperture}` });
  }

  if (meta?.shutter_speed) {
    rows.push({ icon: <Timer size={14} />, label: 'Shutter', value: meta.shutter_speed });
  }

  if (meta?.iso != null) {
    rows.push({ icon: <Sun size={14} />, label: 'ISO', value: String(meta.iso) });
  }

  if (hasResolution) {
    rows.push({ icon: <ImageIcon size={14} />, label: 'Resolution', value: `${asset.width} x ${asset.height}` });
  }

  if (meta?.date_taken) {
    rows.push({
      icon: <Calendar size={14} />,
      label: 'Date',
      value: new Date(meta.date_taken).toLocaleDateString(),
    });
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute right-4 bottom-24 z-50 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white text-sm max-w-xs"
      data-testid="player-exif-panel"
    >
      {/* Metadata rows */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-white/60 shrink-0">
                {row.icon}
                <span>{row.label}</span>
              </div>
              <span className="text-white/90 text-right truncate">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Caption */}
      {caption && (
        <>
          {rows.length > 0 && <div className="border-t border-white/10 my-3" />}
          <p className="text-white/80 italic text-xs leading-relaxed">{caption}</p>
        </>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <>
          {(rows.length > 0 || caption) && <div className="border-t border-white/10 my-3" />}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Hint */}
      <div className="mt-3 pt-2 border-t border-white/10 text-white/40 text-xs text-center">
        Press I to toggle
      </div>
    </motion.div>
  );
};
