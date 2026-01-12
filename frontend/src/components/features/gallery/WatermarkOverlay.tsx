/**
 * WatermarkOverlay Component
 * Renders a watermark image overlay on photos in the gallery canvas.
 *
 * Supports multiple positioning modes:
 * - center: Centered single watermark
 * - top-left, top-right, bottom-left, bottom-right: Corner positioning
 * - tiled: Repeating pattern across the image
 *
 * Uses CSS-based rendering for performance (no canvas compositing).
 * pointer-events: none ensures the underlying image remains interactive.
 */

import React, { useMemo } from 'react';
import type { WatermarkSettings } from '../../../types/canvas';

interface WatermarkOverlayProps {
  settings: WatermarkSettings;
  className?: string;
}

/**
 * Get CSS positioning styles based on watermark position mode
 */
const getPositionStyles = (
  position: WatermarkSettings['position'],
  scale: number = 0.2
): React.CSSProperties => {
  // Base size for non-tiled modes (20% of container by default)
  const sizePercent = `${scale * 100}%`;

  switch (position) {
    case 'center':
      return {
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };

    case 'top-left':
      return {
        backgroundPosition: '5% 5%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };

    case 'top-right':
      return {
        backgroundPosition: '95% 5%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };

    case 'bottom-left':
      return {
        backgroundPosition: '5% 95%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };

    case 'bottom-right':
      return {
        backgroundPosition: '95% 95%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };

    case 'tiled': {
      // For tiled mode, scale determines the size of each tile
      const tileSize = `${scale * 100}px`;
      return {
        backgroundPosition: '0 0',
        backgroundRepeat: 'repeat',
        backgroundSize: `${tileSize} ${tileSize}`,
      };
    }

    default:
      return {
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: sizePercent,
      };
  }
};

export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({
  settings,
  className = '',
}) => {
  // Memoize styles to prevent unnecessary recalculations
  // Must be called unconditionally per React hooks rules
  const overlayStyles = useMemo((): React.CSSProperties | null => {
    if (!settings.enabled || !settings.imageUrl) {
      return null;
    }

    const positionStyles = getPositionStyles(settings.position, settings.scale);

    return {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 5, // Above image but below hover overlay
      backgroundImage: `url(${settings.imageUrl})`,
      opacity: settings.opacity,
      // Mix blend mode helps watermark appear more natural
      mixBlendMode: 'multiply',
      // Ensure watermark doesn't affect layout
      overflow: 'hidden',
      ...positionStyles,
    };
  }, [settings.enabled, settings.imageUrl, settings.position, settings.opacity, settings.scale]);

  // Early return if watermark is disabled or no image URL
  if (!overlayStyles) {
    return null;
  }

  return (
    <div
      className={`watermark-overlay ${className}`}
      style={overlayStyles}
      aria-hidden="true" // Decorative element, hide from screen readers
      data-testid="watermark-overlay"
    />
  );
};

/**
 * Lightweight version for preview in settings panel
 * Shows a smaller representation of how the watermark will appear
 */
export const WatermarkPreview: React.FC<{
  settings: WatermarkSettings;
  previewImageUrl?: string;
}> = ({ settings, previewImageUrl }) => {
  if (!settings.enabled || !settings.imageUrl) {
    return (
      <div className="aspect-video bg-surface-hover rounded-lg flex items-center justify-center">
        <span className="text-text-tertiary text-sm">No watermark configured</span>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-surface-hover rounded-lg overflow-hidden relative">
      {/* Sample background image */}
      {previewImageUrl ? (
        <img
          src={previewImageUrl}
          alt="Preview background"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300" />
      )}

      {/* Watermark overlay */}
      <WatermarkOverlay settings={settings} />
    </div>
  );
};

export default WatermarkOverlay;
