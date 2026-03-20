/**
 * DndSectionList
 *
 * Drag-and-drop sortable list of profile sections.
 * Uses @dnd-kit for accessible drag-and-drop with Framer Motion for smooth animations.
 */

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  useProfileEditor,
  useProfileEditorDispatch,
} from '@/contexts/ProfileEditorContext';

// ---------------------------------------------------------------------------
// SortableItem
// ---------------------------------------------------------------------------

interface SortableItemProps {
  id: string;
}

function SortableItem({ id }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const label = id.charAt(0).toUpperCase() + id.slice(1);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layoutId={id}
      className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing"
    >
      <span {...attributes} {...listeners} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        <GripVertical className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DndSectionList
// ---------------------------------------------------------------------------

export function DndSectionList() {
  const { sectionOrder } = useProfileEditor();
  const dispatch = useProfileEditorDispatch();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sectionOrder.indexOf(String(active.id));
      const newIndex = sectionOrder.indexOf(String(over.id));
      const newOrder = arrayMove(sectionOrder, oldIndex, newIndex);

      dispatch({ type: 'SET_SECTION_ORDER', order: newOrder });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {sectionOrder.map((sectionId) => (
            <SortableItem key={sectionId} id={sectionId} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
