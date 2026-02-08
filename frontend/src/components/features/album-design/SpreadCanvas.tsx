/**
 * SpreadCanvas Component
 *
 * Canvas for rendering and editing a single album spread.
 * Handles element rendering, selection, drag-and-drop, and resize operations.
 */

import React, { useCallback, useRef, useState } from 'react';
import type {
  AlbumSpread,
  AlbumSpreadElement,
  AlbumCollaboratorPresence,
  ElementType,
} from '@rawdrive/shared-types';
import { SpreadElement } from './SpreadElement';
import { CollaboratorCursor } from './CollaboratorCursor';
import { SelectionBox } from './SelectionBox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpreadCanvasProps {
  /** Spread data */
  spread: AlbumSpread;
  /** Album width in pixels */
  albumWidth: number;
  /** Album height in pixels */
  albumHeight: number;
  /** Current zoom level */
  zoom: number;
  /** Current tool */
  tool: 'select' | 'pan' | 'text' | 'shape';
  /** Selected element IDs */
  selectedElementIds: string[];
  /** Callback when element(s) are selected */
  onElementSelect: (elementIds: string[]) => void;
  /** Callback when element is updated */
  onElementUpdate: (elementId: string, updates: Partial<AlbumSpreadElement>) => void;
  /** Callback when element is added */
  onElementAdd: (element: Omit<AlbumSpreadElement, 'id' | 'created_at' | 'updated_at'>) => void;
  /** Collaborators on this spread */
  collaborators: AlbumCollaboratorPresence[];
  /** Current user's color */
  myColor: string;
  /** Class name for container */
  className?: string;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  elementId: string | null;
  originalPosition: { x: number; y: number } | null;
}

interface ResizeState {
  isResizing: boolean;
  handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;
  elementId: string | null;
  startX: number;
  startY: number;
  originalBounds: { x: number; y: number; width: number; height: number } | null;
}

interface SelectionBoxState {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SpreadCanvas: React.FC<SpreadCanvasProps> = ({
  spread,
  albumWidth,
  albumHeight,
  zoom,
  tool,
  selectedElementIds,
  onElementSelect,
  onElementUpdate,
  onElementAdd,
  collaborators,
  myColor,
  className = '',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    elementId: null,
    originalPosition: null,
  });
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    handle: null,
    elementId: null,
    startX: 0,
    startY: 0,
    originalBounds: null,
  });
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState>({
    isSelecting: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Calculate spread dimensions
  const spreadWidth = spread.spread_type === 'full_spread' ? albumWidth * 2 : albumWidth;
  const spreadHeight = albumHeight;

  // Get mouse position relative to canvas
  const getCanvasPosition = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      };
    },
    [zoom]
  );

  // Handle mouse down on canvas
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== canvasRef.current) return;

      const pos = getCanvasPosition(e);

      if (tool === 'select') {
        // Start selection box
        setSelectionBox({
          isSelecting: true,
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
        });

        // Deselect if not holding shift
        if (!e.shiftKey) {
          onElementSelect([]);
        }
      } else if (tool === 'text') {
        // Add text element
        onElementAdd({
          spread_id: spread.id,
          element_type: 'text' as ElementType,
          x: pos.x,
          y: pos.y,
          width: 200,
          height: 50,
          rotation: 0,
          z_index: spread.elements.length + 1,
          opacity: 1,
          content: {
            text: 'Double-click to edit',
          },
          style: {
            font_family: 'Inter',
            font_size: 16,
            text_color: '#000000',
            text_align: 'left',
          },
          locked: false,
          visible: true,
        });
      }
    },
    [tool, getCanvasPosition, onElementSelect, onElementAdd, spread.id, spread.elements.length]
  );

  // Handle mouse move on canvas
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPosition(e);

      // Update selection box
      if (selectionBox.isSelecting) {
        setSelectionBox((prev) => ({
          ...prev,
          currentX: pos.x,
          currentY: pos.y,
        }));
      }

      // Handle element drag
      if (dragState.isDragging && dragState.elementId && dragState.originalPosition) {
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;

        onElementUpdate(dragState.elementId, {
          x: dragState.originalPosition.x + dx,
          y: dragState.originalPosition.y + dy,
        });
      }

      // Handle element resize
      if (resizeState.isResizing && resizeState.elementId && resizeState.originalBounds) {
        const dx = pos.x - resizeState.startX;
        const dy = pos.y - resizeState.startY;
        const { x, y, width, height } = resizeState.originalBounds;
        let newX = x;
        let newY = y;
        let newWidth = width;
        let newHeight = height;

        switch (resizeState.handle) {
          case 'nw':
            newX = x + dx;
            newY = y + dy;
            newWidth = width - dx;
            newHeight = height - dy;
            break;
          case 'n':
            newY = y + dy;
            newHeight = height - dy;
            break;
          case 'ne':
            newY = y + dy;
            newWidth = width + dx;
            newHeight = height - dy;
            break;
          case 'e':
            newWidth = width + dx;
            break;
          case 'se':
            newWidth = width + dx;
            newHeight = height + dy;
            break;
          case 's':
            newHeight = height + dy;
            break;
          case 'sw':
            newX = x + dx;
            newWidth = width - dx;
            newHeight = height + dy;
            break;
          case 'w':
            newX = x + dx;
            newWidth = width - dx;
            break;
        }

        // Enforce minimum size
        const minSize = 20;
        if (newWidth < minSize) {
          newWidth = minSize;
          if (resizeState.handle?.includes('w')) {
            newX = x + width - minSize;
          }
        }
        if (newHeight < minSize) {
          newHeight = minSize;
          if (resizeState.handle?.includes('n')) {
            newY = y + height - minSize;
          }
        }

        onElementUpdate(resizeState.elementId, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [
      getCanvasPosition,
      selectionBox.isSelecting,
      dragState,
      resizeState,
      onElementUpdate,
    ]
  );

  // Handle mouse up on canvas
  const handleCanvasMouseUp = useCallback(() => {
    // Finalize selection box
    if (selectionBox.isSelecting) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      // Find elements within selection box
      const selectedIds = spread.elements
        .filter((el) => {
          const elRight = el.x + el.width;
          const elBottom = el.y + el.height;
          return el.x < maxX && elRight > minX && el.y < maxY && elBottom > minY;
        })
        .map((el) => el.id);

      if (selectedIds.length > 0) {
        onElementSelect(selectedIds);
      }

      setSelectionBox({
        isSelecting: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
    }

    // End drag
    if (dragState.isDragging) {
      setDragState({
        isDragging: false,
        startX: 0,
        startY: 0,
        elementId: null,
        originalPosition: null,
      });
    }

    // End resize
    if (resizeState.isResizing) {
      setResizeState({
        isResizing: false,
        handle: null,
        elementId: null,
        startX: 0,
        startY: 0,
        originalBounds: null,
      });
    }
  }, [selectionBox, dragState, resizeState, spread.elements, onElementSelect]);

  // Handle element click
  const handleElementClick = useCallback(
    (elementId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey) {
        // Toggle selection
        if (selectedElementIds.includes(elementId)) {
          onElementSelect(selectedElementIds.filter((id) => id !== elementId));
        } else {
          onElementSelect([...selectedElementIds, elementId]);
        }
      } else {
        onElementSelect([elementId]);
      }
    },
    [selectedElementIds, onElementSelect]
  );

  // Handle element drag start
  const handleElementDragStart = useCallback(
    (elementId: string, e: React.MouseEvent) => {
      const element = spread.elements.find((el) => el.id === elementId);
      if (!element || element.locked) return;

      const pos = getCanvasPosition(e);
      setDragState({
        isDragging: true,
        startX: pos.x,
        startY: pos.y,
        elementId,
        originalPosition: { x: element.x, y: element.y },
      });
    },
    [spread.elements, getCanvasPosition]
  );

  // Handle element resize start
  const handleElementResizeStart = useCallback(
    (elementId: string, handle: ResizeState['handle'], e: React.MouseEvent) => {
      const element = spread.elements.find((el) => el.id === elementId);
      if (!element || element.locked) return;

      e.stopPropagation();
      const pos = getCanvasPosition(e);
      setResizeState({
        isResizing: true,
        handle,
        elementId,
        startX: pos.x,
        startY: pos.y,
        originalBounds: {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        },
      });
    },
    [spread.elements, getCanvasPosition]
  );

  // Sort elements by z-index
  const sortedElements = [...spread.elements].sort((a, b) => a.z_index - b.z_index);

  return (
    <div className={`relative flex items-center justify-center p-8 ${className}`}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative bg-white shadow-2xl"
        style={{
          width: spreadWidth * zoom,
          height: spreadHeight * zoom,
          backgroundColor: spread.background_color || '#ffffff',
          backgroundImage: spread.background_image_url
            ? `url(${spread.background_image_url})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Page Divider (for full spreads) */}
        {spread.spread_type === 'full_spread' && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 dark:border-gray-600 pointer-events-none"
            style={{ left: (spreadWidth * zoom) / 2 }}
          />
        )}

        {/* Elements */}
        {sortedElements.map((element) => (
          <SpreadElement
            key={element.id}
            element={element}
            zoom={zoom}
            isSelected={selectedElementIds.includes(element.id)}
            onClick={(e) => handleElementClick(element.id, e)}
            onDragStart={(e) => handleElementDragStart(element.id, e)}
            onResizeStart={(handle, e) => handleElementResizeStart(element.id, handle, e)}
            collaboratorColor={
              collaborators.find((c) => c.selected_elements.includes(element.id))?.color
            }
          />
        ))}

        {/* Selection Box */}
        {selectionBox.isSelecting && (
          <SelectionBox
            startX={selectionBox.startX * zoom}
            startY={selectionBox.startY * zoom}
            endX={selectionBox.currentX * zoom}
            endY={selectionBox.currentY * zoom}
            color={myColor}
          />
        )}

        {/* Collaborator Cursors */}
        {collaborators.map(
          (collaborator) =>
            collaborator.cursor && (
              <CollaboratorCursor
                key={collaborator.user_id}
                x={collaborator.cursor.x * zoom}
                y={collaborator.cursor.y * zoom}
                color={collaborator.color}
                name={collaborator.display_name}
              />
            )
        )}
      </div>
    </div>
  );
};

export default SpreadCanvas;
