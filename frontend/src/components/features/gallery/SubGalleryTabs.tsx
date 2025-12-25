/**
 * SubGalleryTabs Component
 * Tab navigation for sub-galleries with pill/chip design
 * Matches screenshot: Root Gallery (filled blue), other tabs (outlined), + New Sub-Gallery
 * Supports drag-drop and context menus
 * Mobile-first responsive design
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
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu';
import type { SubGalleryItem } from '../../../types/gallery';

export interface SubGalleryTabsProps {
  subGalleries: SubGalleryItem[];
  activeSubGalleryId: string | null; // null = Root Gallery
  onTabSelect: (subGalleryId: string | null) => void;
  onCreateSubGallery?: () => void;
  onSortOrderChange?: (subGalleryIds: string[]) => void;
  onRename?: (subGalleryId: string, currentName: string) => void;
  onDelete?: (subGalleryId: string) => void;
  onToggleVisibility?: (subGalleryId: string, visible: boolean) => void;
  droppable?: boolean;
  sortable?: boolean;
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
        distance: 8,
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

  // Tab button styles - matching screenshot exactly
  const getTabClasses = (isActive: boolean, isOver: boolean = false) => {
    const baseClasses = `
      inline-flex items-center gap-1.5
      px-4 py-2
      text-sm font-medium
      rounded-full
      transition-all duration-200
      whitespace-nowrap
      select-none
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2
    `;

    if (isActive) {
      // Active tab - filled blue pill
      return `${baseClasses} bg-primary text-white shadow-sm`;
    }

    // Inactive tab - outlined with dotted border (matching screenshot)
    return `${baseClasses}
      bg-transparent
      text-text-secondary
      border border-dashed border-border
      hover:border-primary/50 hover:text-primary hover:bg-primary/5
      ${isOver && droppable ? 'ring-2 ring-primary ring-offset-2 bg-primary/10' : ''}
    `;
  };

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

    const combinedRef = (node: HTMLDivElement | null) => {
      setNodeRef(node);
      setDroppableRef(node);
    };

    const hasContextMenu = onRename || onDelete || onToggleVisibility;
    const isActive = activeSubGalleryId === subGallery.sub_gallery_id;

    return (
      <div
        ref={combinedRef}
        style={style}
        role="tab"
        tabIndex={0}
        onClick={() => onTabSelect(subGallery.sub_gallery_id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTabSelect(subGallery.sub_gallery_id);
          }
        }}
        onContextMenu={(e) => {
          if (hasContextMenu) {
            handleContextMenu(e, subGallery.sub_gallery_id);
          }
        }}
        className={`
          ${getTabClasses(isActive, isOver)}
          ${isDragging ? 'cursor-grabbing' : sortable ? 'cursor-grab' : 'cursor-pointer'}
          group relative
        `}
        aria-selected={isActive}
        aria-label={subGallery.name}
      >
        {sortable && (
          <span
            {...attributes}
            {...listeners}
            className="touch-target flex-shrink-0"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} className="opacity-40 group-hover:opacity-70" />
          </span>
        )}
        <span>{subGallery.name}</span>
        {!subGallery.visible && (
          <EyeOff size={12} className="opacity-50 flex-shrink-0" aria-label="Hidden" />
        )}
        {hasContextMenu && (
          <button
            type="button"
            className={`
              p-0.5 rounded-full flex-shrink-0
              opacity-0 group-hover:opacity-100
              ${isActive ? 'hover:bg-white/20' : 'hover:bg-black/10'}
              transition-opacity
            `}
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e as unknown as React.MouseEvent, subGallery.sub_gallery_id);
            }}
            aria-label="More options"
          >
            <MoreVertical size={12} />
          </button>
        )}
      </div>
    );
  };

  // Droppable wrapper for tabs
  const DroppableTab: React.FC<{
    id: string;
    children: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    ariaLabel: string;
  }> = ({ id, children, isActive, onClick, ariaLabel }) => {
    const { setNodeRef, isOver } = useDroppable({
      id,
      disabled: !droppable,
    });

    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        className={getTabClasses(isActive, isOver)}
        aria-pressed={isActive}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  };

  const tabContent = (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"
      role="tablist"
      aria-label="Gallery sections"
    >
      {/* Root Gallery Tab - Always First (not sortable) */}
      <DroppableTab
        id="sub-gallery-root"
        isActive={activeSubGalleryId === null}
        onClick={() => onTabSelect(null)}
        ariaLabel="Root Gallery"
      >
        Root Gallery
      </DroppableTab>

      {/* Sub-Gallery Tabs */}
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
          const isActive = activeSubGalleryId === subGallery.sub_gallery_id;
          return (
            <div
              key={subGallery.sub_gallery_id}
              role="tab"
              tabIndex={0}
              onClick={() => onTabSelect(subGallery.sub_gallery_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTabSelect(subGallery.sub_gallery_id);
                }
              }}
              onContextMenu={(e) => {
                if (hasContextMenu) {
                  handleContextMenu(e, subGallery.sub_gallery_id);
                }
              }}
              className={`${getTabClasses(isActive)} cursor-pointer group relative`}
              aria-selected={isActive}
              aria-label={subGallery.name}
            >
              <span>{subGallery.name}</span>
              {!subGallery.visible && (
                <EyeOff size={12} className="opacity-50 flex-shrink-0" aria-label="Hidden" />
              )}
              {hasContextMenu && (
                <button
                  type="button"
                  className={`
                    p-0.5 rounded-full flex-shrink-0
                    opacity-0 group-hover:opacity-100
                    ${isActive ? 'hover:bg-white/20' : 'hover:bg-black/10'}
                    transition-opacity
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e as unknown as React.MouseEvent, subGallery.sub_gallery_id);
                  }}
                  aria-label="More options"
                >
                  <MoreVertical size={12} />
                </button>
              )}
            </div>
          );
        })
      )}

      {/* Create Sub-Gallery Button - matches screenshot + icon */}
      {onCreateSubGallery && (
        <button
          onClick={onCreateSubGallery}
          disabled={isLoading}
          className="
            inline-flex items-center gap-1.5
            px-3 py-2
            text-sm font-medium text-text-tertiary
            hover:text-primary
            transition-colors
            whitespace-nowrap
            disabled:opacity-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
          "
          aria-label="Create new sub-gallery"
        >
          <Plus size={16} />
          <span>New Sub-Gallery</span>
        </button>
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
