/**
 * SpreadElement Component
 *
 * Renders a single element on an album spread.
 * Handles different element types (photo, text, shape) and selection/resize handles.
 */

import React, { useState } from 'react';
import type { AlbumSpreadElement } from '@rawdrive/shared-types';
import { ElementType } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpreadElementProps {
  /** Element data */
  element: AlbumSpreadElement;
  /** Current zoom level */
  zoom: number;
  /** Whether the element is selected */
  isSelected: boolean;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
  /** Drag start handler */
  onDragStart: (e: React.MouseEvent) => void;
  /** Resize start handler */
  onResizeStart: (handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w', e: React.MouseEvent) => void;
  /** Collaborator color if someone else is editing */
  collaboratorColor?: string;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// ---------------------------------------------------------------------------
// Resize Handles Component
// ---------------------------------------------------------------------------

interface ResizeHandlesProps {
  onResizeStart: (handle: ResizeHandle, e: React.MouseEvent) => void;
  color: string;
}

const ResizeHandles: React.FC<ResizeHandlesProps> = ({ onResizeStart, color }) => {
  const handles: { position: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
    { position: 'nw', cursor: 'nw-resize', style: { top: -4, left: -4 } },
    { position: 'n', cursor: 'n-resize', style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
    { position: 'ne', cursor: 'ne-resize', style: { top: -4, right: -4 } },
    { position: 'e', cursor: 'e-resize', style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
    { position: 'se', cursor: 'se-resize', style: { bottom: -4, right: -4 } },
    { position: 's', cursor: 's-resize', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
    { position: 'sw', cursor: 'sw-resize', style: { bottom: -4, left: -4 } },
    { position: 'w', cursor: 'w-resize', style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
  ];

  return (
    <>
      {handles.map(({ position, cursor, style }) => (
        <div
          key={position}
          className="absolute w-2 h-2 rounded-full border-2 bg-white"
          style={{
            ...style,
            borderColor: color,
            cursor,
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(position, e);
          }}
        />
      ))}
    </>
  );
};

// ---------------------------------------------------------------------------
// Element Content Components
// ---------------------------------------------------------------------------

interface PhotoElementContentProps {
  element: AlbumSpreadElement;
}

const PhotoElementContent: React.FC<PhotoElementContentProps> = ({ element }) => {
  // In a real implementation, this would load the asset image
  const imageUrl = element.asset_id ? `/api/v1/assets/${element.asset_id}/thumbnail` : undefined;

  return (
    <div
      className="w-full h-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
      style={{
        borderRadius: element.style?.border_radius || 0,
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{
            filter: element.content?.filters
              ? `
                brightness(${element.content.filters.brightness || 1})
                contrast(${element.content.filters.contrast || 1})
                saturate(${element.content.filters.saturation || 1})
                ${element.content.filters.grayscale ? 'grayscale(1)' : ''}
                sepia(${element.content.filters.sepia || 0})
                blur(${element.content.filters.blur || 0}px)
              `
              : undefined,
          }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

interface TextElementContentProps {
  element: AlbumSpreadElement;
}

const TextElementContent: React.FC<TextElementContentProps> = ({ element }) => {
  return (
    <div
      className="w-full h-full p-2 overflow-hidden"
      style={{
        fontFamily: element.style?.font_family || 'Inter',
        fontSize: element.style?.font_size || 16,
        fontWeight: element.style?.font_weight || 'normal',
        fontStyle: element.style?.font_style || 'normal',
        textAlign: element.style?.text_align || 'left',
        lineHeight: element.style?.line_height || 1.5,
        letterSpacing: element.style?.letter_spacing || 0,
        color: element.style?.text_color || '#000000',
      }}
    >
      {element.content?.html ? (
        <div dangerouslySetInnerHTML={{ __html: element.content.html }} />
      ) : (
        element.content?.text || ''
      )}
    </div>
  );
};

interface ShapeElementContentProps {
  element: AlbumSpreadElement;
}

const ShapeElementContent: React.FC<ShapeElementContentProps> = ({ element }) => {
  const shapeType = element.content?.shape_type || 'rectangle';
  const fillColor = element.style?.fill_color || '#e5e7eb';
  const strokeColor = element.style?.stroke_color;
  const strokeWidth = element.style?.stroke_width || 0;

  if (shapeType === 'rectangle') {
    return (
      <div
        className="w-full h-full"
        style={{
          backgroundColor: fillColor,
          border: strokeWidth ? `${strokeWidth}px solid ${strokeColor}` : undefined,
          borderRadius: element.style?.border_radius || 0,
        }}
      />
    );
  }

  if (shapeType === 'ellipse') {
    return (
      <div
        className="w-full h-full rounded-full"
        style={{
          backgroundColor: fillColor,
          border: strokeWidth ? `${strokeWidth}px solid ${strokeColor}` : undefined,
        }}
      />
    );
  }

  // Custom SVG path
  if (element.content?.path_data) {
    return (
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={element.content.path_data}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  return null;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const SpreadElement: React.FC<SpreadElementProps> = ({
  element,
  zoom,
  isSelected,
  onClick,
  onDragStart,
  onResizeStart,
  collaboratorColor,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine border color
  const borderColor = collaboratorColor || (isSelected ? '#3b82f6' : 'transparent');
  const showHandles = isSelected && !element.locked;

  // Apply shadow if defined
  const shadowStyle = element.style?.shadow
    ? `${element.style.shadow.x}px ${element.style.shadow.y}px ${element.style.shadow.blur}px ${element.style.shadow.spread}px ${element.style.shadow.color}`
    : undefined;

  // Render element content based on type
  const renderContent = () => {
    switch (element.element_type) {
      case ElementType.PHOTO:
        return <PhotoElementContent element={element} />;
      case ElementType.TEXT:
        return <TextElementContent element={element} />;
      case ElementType.SHAPE:
      case ElementType.BACKGROUND:
        return <ShapeElementContent element={element} />;
      case ElementType.FRAME:
        return <ShapeElementContent element={element} />;
      case ElementType.EMBELLISHMENT:
        return <ShapeElementContent element={element} />;
      default:
        return null;
    }
  };

  if (!element.visible) {
    return null;
  }

  return (
    <div
      className="absolute"
      style={{
        left: element.x * zoom,
        top: element.y * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
        transform: `rotate(${element.rotation}deg)`,
        opacity: element.opacity,
        boxShadow: shadowStyle,
        cursor: element.locked ? 'not-allowed' : 'move',
        outline: `2px solid ${borderColor}`,
        outlineOffset: -2,
        zIndex: element.z_index,
      }}
      onClick={onClick}
      onMouseDown={(e) => {
        if (!element.locked && e.button === 0) {
          onDragStart(e);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Element Content */}
      {renderContent()}

      {/* Lock indicator */}
      {element.locked && isHovered && (
        <div className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
      )}

      {/* Collaborator indicator */}
      {collaboratorColor && !isSelected && (
        <div
          className="absolute -top-6 left-0 px-1.5 py-0.5 text-xs font-medium text-white rounded"
          style={{ backgroundColor: collaboratorColor }}
        >
          Editing
        </div>
      )}

      {/* Resize Handles */}
      {showHandles && <ResizeHandles onResizeStart={onResizeStart} color="#3b82f6" />}
    </div>
  );
};

export default SpreadElement;
