/**
 * SelectionBox Component
 *
 * Displays a selection rectangle when dragging to select multiple elements.
 */

import React from 'react';

interface SelectionBoxProps {
  /** Start X position */
  startX: number;
  /** Start Y position */
  startY: number;
  /** End X position */
  endX: number;
  /** End Y position */
  endY: number;
  /** Selection color */
  color: string;
}

export const SelectionBox: React.FC<SelectionBoxProps> = ({
  startX,
  startY,
  endX,
  endY,
  color,
}) => {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < 2 && height < 2) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left,
        top,
        width,
        height,
        backgroundColor: `${color}20`,
        border: `1px dashed ${color}`,
      }}
    />
  );
};

export default SelectionBox;
