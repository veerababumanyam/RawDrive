/**
 * SubEventList: Displays and manages the list of sub-events for an invitation
 *
 * Features:
 * - Drag-and-drop reordering
 * - Add/Edit/Delete sub-events
 * - Countdown timers for each event
 *
 * Feature: 016-save-the-date Phase 8
 */

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Calendar,
  MapPin,
  Clock,
  Timer,
  Loader2,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { SubEventEditor } from './SubEventEditor';
import * as invitationService from '@/services/invitationService';
import type { SubEvent } from '@/types/invitations';

interface SubEventListProps {
  workspaceId: string;
  invitationId: string;
  isEditable?: boolean;
}

// Helper to format countdown
const formatCountdown = (eventDatetime: string): string => {
  const now = new Date();
  const eventDate = new Date(eventDatetime);
  const diff = eventDate.getTime() - now.getTime();

  if (diff <= 0) return 'Event passed';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''} ${hours}h`;
  }
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

// Helper to format date
const formatEventDate = (datetime: string, timezone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(datetime));
  } catch {
    return new Date(datetime).toLocaleString();
  }
};

export const SubEventList: React.FC<SubEventListProps> = ({
  workspaceId,
  invitationId,
  isEditable = true,
}) => {
  const queryClient = useQueryClient();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSubEvent, setEditingSubEvent] = useState<SubEvent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SubEvent | null>(null);

  // Fetch sub-events
  const {
    data: subEvents = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sub-events', workspaceId, invitationId],
    queryFn: () => invitationService.listSubEvents(workspaceId, invitationId),
    enabled: !!workspaceId && !!invitationId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<SubEvent>) =>
      invitationService.createSubEvent(workspaceId, invitationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-events', workspaceId, invitationId] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ subEventId, data }: { subEventId: string; data: Partial<SubEvent> }) =>
      invitationService.updateSubEvent(workspaceId, invitationId, subEventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-events', workspaceId, invitationId] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (subEventId: string) =>
      invitationService.deleteSubEvent(workspaceId, invitationId, subEventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-events', workspaceId, invitationId] });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (subEventIds: string[]) =>
      invitationService.reorderSubEvents(workspaceId, invitationId, subEventIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-events', workspaceId, invitationId] });
    },
  });

  const handleAddNew = () => {
    setEditingSubEvent(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (subEvent: SubEvent) => {
    setEditingSubEvent(subEvent);
    setIsEditorOpen(true);
  };

  const handleSave = async (data: Partial<SubEvent>) => {
    if (editingSubEvent) {
      await updateMutation.mutateAsync({
        subEventId: editingSubEvent.sub_event_id,
        data,
      });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteMutation.mutateAsync(deleteConfirm.sub_event_id);
      setDeleteConfirm(null);
    }
  };

  // Simple drag-and-drop handlers (basic implementation)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (dragIndex === dropIndex) return;

    const newOrder = [...subEvents];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);

    const ids = newOrder.map((se) => se.sub_event_id);
    reorderMutation.mutate(ids);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-error">
        Failed to load events. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Events ({subEvents.length})
        </h3>
        {isEditable && (
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleAddNew}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Event
          </AppButton>
        )}
      </div>

      {/* Empty State */}
      {subEvents.length === 0 && (
        <AppCard className="text-center py-8">
          <Calendar className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary mb-4">
            No sub-events added yet. Add ceremonies, functions, or other events.
          </p>
          {isEditable && (
            <AppButton onClick={handleAddNew} leftIcon={<Plus className="w-4 h-4" />}>
              Add First Event
            </AppButton>
          )}
        </AppCard>
      )}

      {/* Event List */}
      <div className="space-y-3">
        {subEvents.map((subEvent, index) => (
          <div
            key={subEvent.sub_event_id}
            draggable={isEditable}
            onDragStart={(e) => handleDragStart(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragOver={handleDragOver}
            className="group"
          >
            <AppCard className="p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start gap-3">
                {/* Drag Handle */}
                {isEditable && (
                  <div className="cursor-grab text-text-tertiary hover:text-text-secondary pt-1">
                    <GripVertical className="w-5 h-5" />
                  </div>
                )}

                {/* Event Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-text-primary truncate">
                      {subEvent.name}
                    </h4>
                    {subEvent.event_type && (
                      <AppBadge variant="default" size="sm">
                        {subEvent.event_type}
                      </AppBadge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatEventDate(subEvent.event_datetime, subEvent.event_timezone)}
                    </span>
                    {subEvent.venue_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {subEvent.venue_name}
                        {subEvent.venue_city && `, ${subEvent.venue_city}`}
                      </span>
                    )}
                  </div>

                  {subEvent.show_countdown && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
                      <Timer className="w-3.5 h-3.5" />
                      {formatCountdown(subEvent.event_datetime)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isEditable && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(subEvent)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(subEvent)}
                      className="h-8 w-8 p-0 text-error hover:text-error"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AppButton>
                  </div>
                )}
              </div>
            </AppCard>
          </div>
        ))}
      </div>

      {/* Editor Modal */}
      <SubEventEditor
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingSubEvent(null);
        }}
        onSave={handleSave}
        subEvent={editingSubEvent}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete Event"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default SubEventList;
