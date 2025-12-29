/**
 * FaceIndicatorBadge Component
 * Displays a badge showing the number of faces detected in a photo.
 * Shows person names on hover when available.
 *
 * Design:
 * - Glassmorphism style matching other badges
 * - Shows count only (bounding boxes are in Lightbox)
 * - Positioned in top-left with other status badges
 */

import React, { useState } from 'react';
import { Users } from 'lucide-react';

interface FaceIndicatorBadgeProps {
  /** Number of faces detected */
  faceCount: number;
  /** Names of identified people (from face groups) */
  personNames?: string[];
  /** Custom class name */
  className?: string;
}

export const FaceIndicatorBadge: React.FC<FaceIndicatorBadgeProps> = ({
  faceCount,
  personNames = [],
  className = '',
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Don't render if no faces
  if (faceCount <= 0) {
    return null;
  }

  // Build tooltip content
  const hasNames = personNames.length > 0;
  const namedCount = personNames.length;
  const unnamedCount = faceCount - namedCount;

  const tooltipLines: string[] = [];
  if (hasNames) {
    // Show first 3 names, then "+N more"
    const displayNames = personNames.slice(0, 3);
    tooltipLines.push(...displayNames);
    if (personNames.length > 3) {
      tooltipLines.push(`+${personNames.length - 3} more`);
    }
  }
  if (unnamedCount > 0) {
    tooltipLines.push(`${unnamedCount} unnamed`);
  }

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Badge */}
      <div
        className="
          flex items-center gap-1
          px-2 py-1
          rounded-full
          bg-accent/90 backdrop-blur-sm
          shadow-sm
          transition-all duration-200
          hover:bg-accent
        "
        aria-label={`${faceCount} ${faceCount === 1 ? 'face' : 'faces'} detected`}
        title={tooltipLines.join(', ')}
      >
        <Users size={12} className="text-white" />
        <span className="text-[11px] font-semibold text-white tabular-nums">
          {faceCount}
        </span>
      </div>

      {/* Tooltip (shows on hover when there are names) */}
      {showTooltip && tooltipLines.length > 0 && (
        <div
          className="
            absolute top-full left-0 mt-1.5
            z-50
            min-w-[120px] max-w-[200px]
            px-2.5 py-1.5
            bg-neutral-900/95 backdrop-blur-sm
            rounded-lg
            shadow-lg
            pointer-events-none
            animate-fade-in
          "
          role="tooltip"
        >
          <ul className="space-y-0.5">
            {tooltipLines.map((line, index) => (
              <li
                key={index}
                className="text-xs text-white/90 truncate"
              >
                {line}
              </li>
            ))}
          </ul>
          {/* Tooltip arrow */}
          <div
            className="
              absolute -top-1.5 left-3
              w-3 h-3
              bg-neutral-900/95
              rotate-45
            "
          />
        </div>
      )}
    </div>
  );
};

export default FaceIndicatorBadge;
