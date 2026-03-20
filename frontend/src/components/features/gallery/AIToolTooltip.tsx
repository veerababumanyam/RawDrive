/**
 * AIToolTooltip Component
 * Tooltip wrapper for AI toolbar buttons with hover (desktop) and long-press (mobile) behavior
 */

import React, { useState, useRef, useCallback } from 'react';

/** Descriptions for each AI tool in the gallery toolbar */
export const AI_TOOL_DESCRIPTIONS: Record<string, string> = {
  auto_tag: 'Automatically tags photos using AI image recognition to identify objects, scenes, and activities.',
  face_detect: 'Identifies and groups faces across photos for easy sorting and organization.',
  auto_cull: 'Removes blurry, duplicate, and low-quality photos to streamline your gallery.',
  smart_album: 'Groups photos into albums based on time, location, and visual similarity.',
  background_remove: 'Removes or replaces photo backgrounds using AI segmentation.',
  enhance: 'Enhances photo quality with AI-powered color correction, noise reduction, and sharpening.',
};

export interface AIToolTooltipProps {
  /** Short label shown in tooltip header */
  label: string;
  /** 1-2 sentence description of the AI tool */
  description: string;
  /** Button or element to wrap */
  children: React.ReactNode;
  /** Tooltip position relative to the trigger */
  position?: 'top' | 'bottom';
}

export const AIToolTooltip: React.FC<AIToolTooltipProps> = ({
  label,
  description,
  children,
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    setIsVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setIsVisible(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(showTooltip, 200);
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const handleTouchStart = useCallback(() => {
    touchTimeoutRef.current = setTimeout(showTooltip, 500);
  }, [showTooltip]);

  const handleTouchEnd = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const handleTouchMove = useCallback(() => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  }, []);

  const positionClasses = position === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  const arrowClasses = position === 'top'
    ? 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-x-transparent border-b-transparent border-4'
    : 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-x-transparent border-t-transparent border-4';

  return (
    <div
      className="relative inline-flex"
      data-tooltip-wrapper
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {children}

      {isVisible && (
        <div
          role="tooltip"
          className={`
            absolute ${positionClasses} left-1/2 -translate-x-1/2
            z-50
            bg-gray-900 text-white text-xs rounded-lg
            px-3 py-2
            shadow-lg
            max-w-xs
            whitespace-normal
            pointer-events-none
          `}
        >
          <div className="font-semibold mb-0.5">{label}</div>
          <div className="text-gray-300 leading-relaxed">{description}</div>
          {/* Arrow */}
          <div className={`absolute ${arrowClasses} w-0 h-0`} />
        </div>
      )}
    </div>
  );
};
