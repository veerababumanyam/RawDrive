/**
 * SubGalleryTabs Component
 * Tab navigation for sub-galleries with pill/chip design
 * Matches screenshot: Root Gallery (filled blue), other tabs (outlined), + New Sub-Gallery
 * 
 * Features:
 * - Drag-and-drop reordering (when sortable={true})
 *   * GripVertical icon serves as drag handle (44px touch target for WCAG compliance)
 *   * Uses @dnd-kit library with PointerSensor (mouse/touch) and KeyboardSensor (keyboard)
 *   * 8px activation distance prevents accidental drags
 *   * Calls onSortOrderChange callback to persist order via API
 * - Context menu support (rename, delete, toggle visibility)
 * - WCAG 2.1 AA compliant (4.5:1 text contrast, 3:1 UI component contrast, 44px touch targets)
 * - Mobile-first responsive design
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

  // Tab button styles - Apple iOS style with glassmorphism
  // WCAG 2.1 AA compliant: 4.5:1 text contrast, 3:1 UI component contrast
  // Note: Drag handle (GripVertical) has its own 44px touch target; tabs are smaller for visual balance
  const getTabClasses = (isActive: boolean, isOver: boolean = false) => {
    const baseClasses = `
      inline-flex items-center gap-1.5
      px-3 py-1.5 sm:px-4 sm:py-2
      text-sm sm:text-base font-medium
      rounded-full
      transition-all duration-200 ease-out
      whitespace-nowrap
      select-none
      h-[36px] sm:h-[38px]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
      focus-visible:ring-offset-background
    `;

    if (isActive) {
      // Active tab - iOS style filled with visible gradient (WCAG AA: white text on blue meets 4.5:1)
      // Gradient: blue-600 (#2563EB) to blue-500 (#3B82F6) for better visibility
      return `${baseClasses} 
        bg-gradient-to-r from-primary-600 via-primary-500 to-primary-500
        dark:from-primary-500 dark:via-primary-400 dark:to-primary-400
        text-white
        shadow-lg shadow-primary-600/30 dark:shadow-primary-500/40
        hover:shadow-xl hover:shadow-primary-600/40 dark:hover:shadow-primary-500/50
        scale-[1.02]
      `;
    }

    // Inactive tab - iOS style glassmorphism with improved contrast (WCAG AA: 3:1 UI component)
    // Using darker borders and backgrounds for better visibility
    return `${baseClasses}
      backdrop-blur-sm
      bg-white/80 dark:bg-slate-800/80
      border-2 border-slate-300/60 dark:border-slate-600/70
      text-slate-700 dark:text-slate-200
      hover:bg-white dark:hover:bg-slate-700
      hover:border-primary-500/60 dark:hover:border-primary-400/60
      hover:text-primary-700 dark:hover:text-primary-300
      hover:shadow-md
      ${isOver && droppable ? 'ring-2 ring-primary-500/60 dark:ring-primary-400/60 ring-offset-1 bg-primary-100/50 dark:bg-primary-900/30' : ''}
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
        {/* Drag Handle - Only shown when sortable={true} */}
        {/* Functionality: Allows users to drag and reorder sub-gallery tabs */}
        {/* The touch-target class ensures 44px minimum touch target for WCAG accessibility */}
        {/* The drag-and-drop is implemented using @dnd-kit library with keyboard support */}
        {sortable && (
          <span
            {...attributes}
            {...listeners}
            className="touch-target flex-shrink-0 p-0.5 rounded hover:bg-white/10 dark:hover:bg-white/5 transition-colors"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} className={`${isActive ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'} group-hover:opacity-100 opacity-70 transition-opacity`} />
          </span>
        )}
        <span className="truncate max-w-[140px] sm:max-w-none">{subGallery.name}</span>
        {!subGallery.visible && (
          <EyeOff size={14} className={`${isActive ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'} flex-shrink-0`} aria-label="Hidden" />
        )}
        {hasContextMenu && (
          <button
            type="button"
            className={`
              p-0.5 rounded-full flex-shrink-0
              opacity-0 group-hover:opacity-100
              transition-all duration-200
              min-w-[24px] min-h-[24px]
              focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
              ${isActive 
                ? 'hover:bg-white/20 text-white/90' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e as unknown as React.MouseEvent, subGallery.sub_gallery_id);
            }}
            aria-label="More options"
          >
            <MoreVertical size={14} />
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
      className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"
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
              <span className="truncate max-w-[140px] sm:max-w-none">{subGallery.name}</span>
              {!subGallery.visible && (
                <EyeOff size={14} className={`${isActive ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'} flex-shrink-0`} aria-label="Hidden" />
              )}
              {hasContextMenu && (
                <button
                  type="button"
                  className={`
                    p-0.5 rounded-full flex-shrink-0
                    opacity-0 group-hover:opacity-100
                    transition-all duration-200
                    min-w-[24px] min-h-[24px]
                    focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
                    ${isActive 
                      ? 'hover:bg-white/20 text-white/90' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e as unknown as React.MouseEvent, subGallery.sub_gallery_id);
                  }}
                  aria-label="More options"
                >
                  <MoreVertical size={14} />
                </button>
              )}
            </div>
          );
        })
      )}

      {/* Create Sub-Gallery Button - iOS style with WCAG AA compliance */}
      {onCreateSubGallery && (
        <button
          onClick={onCreateSubGallery}
          disabled={isLoading}
          className="
            inline-flex items-center gap-1.5
            px-3 py-1.5 sm:px-4 sm:py-2
            text-sm sm:text-base font-medium
            rounded-full
            backdrop-blur-sm
            bg-white/80 dark:bg-slate-800/80
            border-2 border-dashed border-primary-500/50 dark:border-primary-400/60
            text-primary-700 dark:text-primary-300
            hover:bg-primary-50 dark:hover:bg-primary-900/30
            hover:border-primary-600/70 dark:hover:border-primary-400/80
            hover:text-primary-800 dark:hover:text-primary-200
            hover:shadow-md
            transition-all duration-200 ease-out
            whitespace-nowrap
            h-[36px] sm:h-[38px]
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
            focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
            focus-visible:ring-offset-background
          "
          aria-label="Create new sub-gallery"
        >
          <Plus size={14} className="sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">New Sub-Gallery</span>
          <span className="sm:hidden">New</span>
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
