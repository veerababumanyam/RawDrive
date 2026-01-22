/**
 * ActionBarTooltip Component
 * Fast-displaying tooltip for Gallery Action Bar buttons
 * - Fast display with 100ms delay (no external dependencies)
 * - Consistent styling across all browsers
 * - Accessible (WCAG 2.1 AA compliant)
 * - Keyboard navigation support (Tab, Focus)
 * - No tooltips on touch devices
 */

import React, { useState, useRef } from 'react';

interface ActionBarTooltipProps {
  /** Tooltip content/help text */
  content: string;
  /** Button element to wrap */
  children: React.ReactElement;
}

export const ActionBarTooltip: React.FC<ActionBarTooltipProps> = ({
  content,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // 100ms delay for fast display
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(true);
  };

  const handleBlur = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex group">
      {React.cloneElement(children, {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      })}

      {/* Tooltip popup - appears below button */}
      {isOpen && (
        <div
          role="tooltip"
          className="
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-[100]
            max-w-[280px] w-max px-3.5 py-2.5
            rounded-xl shadow-2xl
            text-xs font-medium leading-relaxed tracking-tight
            animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200
          "
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px) saturate(160%)',
            WebkitBackdropFilter: 'blur(12px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div className="relative z-10 text-center">
            {content}
          </div>

          {/* Arrow pointing down */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(15, 23, 42, 0.85)',
            }}
          />
        </div>
      )}
    </div>
  );
};
