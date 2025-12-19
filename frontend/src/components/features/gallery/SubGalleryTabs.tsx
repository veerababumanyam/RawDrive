/**
 * SubGalleryTabs Component
 * Tab navigation for sub-galleries with "Root Gallery" first
 * Property 8: Sub-Gallery Tab Rendering
 * Supports drag-drop from PhotoGrid to move photos to sub-galleries
 * Supports drag-drop reordering of tabs themselves
 * Supports context menu for rename, delete, visibility toggle
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, GripVertical, Edit, Trash2, Eye, EyeOff, MoreVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppButton } from '../../ui/AppButton';
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu';
import type { SubGalleryItem } from '../../../types/gallery';

export interface SubGalleryTabsProps {
  subGalleries: SubGalleryItem[];
  activeSubGalleryId: string | null; // null = Root Gallery
  onTabSelect: (subGalleryId: string | null) => void;
  onCreateSubGallery?: () => void;
  onSortOrderChange?: (subGalleryIds: string[]) => void; // New order of sub-gallery IDs
  onRename?: (subGalleryId: string, currentName: string) => void;
  onDelete?: (subGalleryId: string) => void;
  onToggleVisibility?: (subGalleryId: string, visible: boolean) => void;
  droppable?: boolean; // Enable drop zones for drag-to-tab
  sortable?: boolean; // Enable drag-drop reordering of tabs
  isLoading?: boolean;
}

export const SubGalleryTabs: React.FC<SubGalleryTabsProps> = ({
  subGalleries,
  activeSubGalleryId,
  onTabSelect,
  onCreateSubGallery,
  onSortOrderChange,
  onRename,
  onDelete,
  onToggleVisibility,
  droppable = false,
  sortable = false,
  isLoading = false,
}) => {
  // Sort sub-galleries by sort_order
  const [items, setItems] = useState<SubGalleryItem[]>(
    [...subGalleries].sort((a, b) => a.sort_order - b.sort_order)
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    subGalleryId: string;
  } | null>(null);

  // Update items when subGalleries prop changes
  useEffect(() => {
    setItems([...subGalleries].sort((a, b) => a.sort_order - b.sort_order));
  }, [subGalleries]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for tab reordering
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || !sortable || !onSortOrderChange) {
        return;
      }

      // Only handle reordering if both are sub-gallery IDs (not root gallery)
      if (
        typeof active.id === 'string' &&
        typeof over.id === 'string' &&
        active.id.startsWith('sub-gallery-') &&
        over.id.startsWith('sub-gallery-') &&
        active.id !== over.id
      ) {
        const oldIndex = items.findIndex((item) => item.sub_gallery_id === String(active.id).replace('sub-gallery-', ''));
        const newIndex = items.findIndex((item) => item.sub_gallery_id === String(over.id).replace('sub-gallery-', ''));

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(items, oldIndex, newIndex);
          setItems(newItems);
          // Call parent callback with new order
          onSortOrderChange(newItems.map((item) => item.sub_gallery_id));
        }
      }
    },
    [items, sortable, onSortOrderChange]
  );

  // Handle right-click on tab
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, subGalleryId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        subGalleryId,
      });
    },
    []
  );

  // Build context menu items
  const getContextMenuItems = useCallback(
    (subGalleryId: string): ContextMenuItem[] => {
      const subGallery = items.find((item) => item.sub_gallery_id === subGalleryId);
      if (!subGallery) return [];

      const menuItems: ContextMenuItem[] = [];

      if (onRename) {
        menuItems.push({
          label: 'Rename',
          icon: <Edit size={16} />,
          onClick: () => {
            onRename(subGalleryId, subGallery.name);
          },
        });
      }

      if (onToggleVisibility) {
        menuItems.push({
          label: subGallery.visible ? 'Hide' : 'Show',
          icon: subGallery.visible ? <EyeOff size={16} /> : <Eye size={16} />,
          onClick: () => {
            onToggleVisibility(subGalleryId, !subGallery.visible);
          },
        });
      }

      if (onDelete) {
        menuItems.push({
          label: 'Delete',
          icon: <Trash2 size={16} />,
          variant: 'destructive',
          separator: true,
          onClick: () => {
            onDelete(subGalleryId);
          },
        });
      }

      return menuItems;
    },
    [items, onRename, onDelete, onToggleVisibility]
  );

  // Sortable tab component
  const SortableTab: React.FC<{
    subGallery: SubGalleryItem;
  }> = ({ subGallery }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: `sub-gallery-${subGallery.sub_gallery_id}`,
      disabled: !sortable,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
      id: `sub-gallery-${subGallery.sub_gallery_id}`,
      disabled: !droppable,
    });

    const combinedRef = (node: HTMLButtonElement | null) => {
      setNodeRef(node);
      setDroppableRef(node);
    };

    const hasContextMenu = onRename || onDelete || onToggleVisibility;

    return (
      <button
        ref={combinedRef}
        style={style}
        onClick={() => onTabSelect(subGallery.sub_gallery_id)}
        onContextMenu={(e) => {
          if (hasContextMenu) {
            handleContextMenu(e, subGallery.sub_gallery_id);
          }
        }}
        className={`
          flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors
          flex items-center gap-2 relative group
          ${activeSubGalleryId === subGallery.sub_gallery_id
            ? 'bg-primary text-white'
            : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }
          ${isOver && droppable ? 'ring-2 ring-primary ring-offset-2 bg-primary/20' : ''}
          ${isDragging ? 'cursor-grabbing' : sortable ? 'cursor-grab' : ''}
        `}
        aria-pressed={activeSubGalleryId === subGallery.sub_gallery_id}
        aria-label={subGallery.name}
      >
        {sortable && (
          <span
            {...attributes}
            {...listeners}
            className="touch-target"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} className="opacity-50" />
          </span>
        )}
        <span className="flex-1">{subGallery.name}</span>
        {!subGallery.visible && (
          <EyeOff size={14} className="opacity-50" aria-label="Hidden" />
        )}
        {hasContextMenu && (
          <button
            className="
              p-0.5 rounded
              opacity-0 group-hover:opacity-100
              hover:bg-white/20 dark:hover:bg-black/20
              transition-opacity
              touch-target
            "
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e as any, subGallery.sub_gallery_id);
            }}
            aria-label="More options"
          >
            <MoreVertical size={14} />
          </button>
        )}
      </button>
    );
  };

  // Droppable wrapper component for tabs
  const DroppableTab: React.FC<{
    id: string;
    subGalleryId: string | null;
    children: React.ReactNode;
    className: string;
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    ariaPressed: boolean;
    ariaLabel: string;
  }> = ({ id, children, className, onClick, onContextMenu, ariaPressed, ariaLabel }) => {
    const { setNodeRef, isOver } = useDroppable({
      id,
      disabled: !droppable,
    });

    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`
          ${className}
          ${isOver && droppable ? 'ring-2 ring-primary ring-offset-2 bg-primary/20' : ''}
        `}
        aria-pressed={ariaPressed}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  };

  const tabContent = (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
      {/* Root Gallery Tab - Always First (not sortable) */}
      <DroppableTab
        id="sub-gallery-root"
        subGalleryId={null}
        className={`
          flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors
          ${activeSubGalleryId === null
            ? 'bg-primary text-white'
            : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }
        `}
        onClick={() => onTabSelect(null)}
        ariaPressed={activeSubGalleryId === null}
        ariaLabel="Root Gallery"
      >
        Root Gallery
      </DroppableTab>

      {/* Sub-Gallery Tabs - Sortable if enabled */}
      {sortable ? (
        <SortableContext
          items={items.map((item) => `sub-gallery-${item.sub_gallery_id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {items.map((subGallery) => (
            <SortableTab key={subGallery.sub_gallery_id} subGallery={subGallery} />
          ))}
        </SortableContext>
      ) : (
        items.map((subGallery) => {
          const hasContextMenu = onRename || onDelete || onToggleVisibility;
          return (
            <DroppableTab
              key={subGallery.sub_gallery_id}
              id={`sub-gallery-${subGallery.sub_gallery_id}`}
              subGalleryId={subGallery.sub_gallery_id}
              className={`
                flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors
                flex items-center gap-2 relative group
                ${activeSubGalleryId === subGallery.sub_gallery_id
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }
              `}
              onClick={() => onTabSelect(subGallery.sub_gallery_id)}
              onContextMenu={(e) => {
                if (hasContextMenu) {
                  handleContextMenu(e, subGallery.sub_gallery_id);
                }
              }}
              ariaPressed={activeSubGalleryId === subGallery.sub_gallery_id}
              ariaLabel={subGallery.name}
            >
              <span className="flex-1">{subGallery.name}</span>
              {!subGallery.visible && (
                <EyeOff size={14} className="opacity-50" aria-label="Hidden" />
              )}
              {hasContextMenu && (
                <button
                  className="
                    p-0.5 rounded
                    opacity-0 group-hover:opacity-100
                    hover:bg-white/20 dark:hover:bg-black/20
                    transition-opacity
                    touch-target
                  "
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e as any, subGallery.sub_gallery_id);
                  }}
                  aria-label="More options"
                >
                  <MoreVertical size={14} />
                </button>
              )}
            </DroppableTab>
          );
        })
      )}

      {/* Create Sub-Gallery Button */}
      {onCreateSubGallery && (
        <AppButton
          variant="ghost"
          size="sm"
          leftIcon={<Plus size={16} />}
          onClick={onCreateSubGallery}
          disabled={isLoading}
          className="flex-shrink-0"
        >
          New Sub-Gallery
        </AppButton>
      )}
    </div>
  );

  // Wrap in DndContext if sortable
  const wrappedContent = sortable ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {tabContent}
    </DndContext>
  ) : (
    tabContent
  );

  return (
    <>
      {wrappedContent}
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          onClose={() => setContextMenu(null)}
          items={getContextMenuItems(contextMenu.subGalleryId)}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}
    </>
  );
};
