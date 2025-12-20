/**
 * SmartListManager Component
 *
 * Manages smart lists for client filtering.
 * Requirements: 22.1 - Create, edit, delete smart lists
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Filter,
  Plus,
  Edit,
  Trash2,
  Users,
  Loader2,
  ChevronRight,
  List,
  Clock,
  Star,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { DeleteConfirmationDialog } from '../../ui/DeleteConfirmationDialog';
import { SmartListDialog } from './SmartListDialog';
import { clientService } from '../../../services/clientService';
import type { SmartListWithCount, SmartList, ClientListItem } from '../../../types/client';

/* =============================================================================
   SmartListManager Component
   ============================================================================= */

interface SmartListManagerProps {
  /** Workspace ID */
  workspaceId: string;
  /** Callback when a smart list is selected */
  onSelectList?: (list: SmartList | null, clients: ClientListItem[]) => void;
  /** Currently selected list ID */
  selectedListId?: string | null;
}

// Pre-built smart list icons
const getListIcon = (name: string) => {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('recent')) return <Clock size={16} />;
  if (nameLower.includes('inactive')) return <AlertCircle size={16} />;
  if (nameLower.includes('vip')) return <Star size={16} />;
  if (nameLower.includes('pending')) return <CheckCircle2 size={16} />;
  return <List size={16} />;
};

export const SmartListManager: React.FC<SmartListManagerProps> = ({
  workspaceId,
  onSelectList,
  selectedListId,
}) => {
  const { addToast } = useToast();

  // State
  const [smartLists, setSmartLists] = useState<SmartListWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<SmartList | null>(null);
  const [deletingList, setDeletingList] = useState<SmartListWithCount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [evaluatingListId, setEvaluatingListId] = useState<string | null>(null);

  // Fetch smart lists
  const fetchSmartLists = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const data = await clientService.getSmartLists(workspaceId);
      setSmartLists(data);
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to load smart lists',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, addToast]);

  // Load smart lists on mount
  useEffect(() => {
    fetchSmartLists();
  }, [fetchSmartLists]);

  // Handle list creation/update
  const handleListSaved = useCallback(async () => {
    await fetchSmartLists();
    setDialogOpen(false);
    setEditingList(null);
    addToast({
      variant: 'success',
      message: editingList
        ? 'Smart list updated successfully'
        : 'Smart list created successfully',
    });
  }, [fetchSmartLists, editingList, addToast]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deletingList) return;

    setIsDeleting(true);
    try {
      await clientService.deleteSmartList(workspaceId, deletingList.list_id);
      await fetchSmartLists();
      addToast({
        variant: 'success',
        message: 'Smart list deleted successfully',
      });
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to delete smart list',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeletingList(null);
    }
  }, [workspaceId, deletingList, fetchSmartLists, addToast]);

  // Evaluate and select list
  const handleSelectList = useCallback(
    async (list: SmartListWithCount) => {
      setEvaluatingListId(list.list_id);
      try {
        const result = await clientService.evaluateSmartList(
          workspaceId,
          list.list_id,
          { limit: 100 }
        );
        onSelectList?.(list, result.clients);
      } catch (error) {
        addToast({
          variant: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to evaluate smart list',
        });
      } finally {
        setEvaluatingListId(null);
      }
    },
    [workspaceId, onSelectList, addToast]
  );

  // Clear selection
  const handleClearSelection = useCallback(() => {
    onSelectList?.(null, []);
  }, [onSelectList]);

  // Separate system lists from user lists
  const systemLists = smartLists.filter((l) => l.is_system);
  const userLists = smartLists.filter((l) => !l.is_system);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-text-tertiary" />
          <h3 className="font-semibold text-text-primary">Smart Lists</h3>
        </div>
        <AppButton
          variant="outline"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => {
            setEditingList(null);
            setDialogOpen(true);
          }}
        >
          New List
        </AppButton>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selected List Indicator */}
          {selectedListId && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-primary" />
                <span className="text-sm font-medium text-primary">
                  Filtering by:{' '}
                  {smartLists.find((l) => l.list_id === selectedListId)?.name}
                </span>
              </div>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
              >
                Clear
              </AppButton>
            </div>
          )}

          {/* Pre-built Lists */}
          {systemLists.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Quick Filters
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {systemLists.map((list) => (
                  <SmartListItem
                    key={list.list_id}
                    list={list}
                    isSelected={selectedListId === list.list_id}
                    isEvaluating={evaluatingListId === list.list_id}
                    onSelect={() => handleSelectList(list)}
                    isSystem
                  />
                ))}
              </div>
            </div>
          )}

          {/* User Lists */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
              Your Smart Lists
            </h4>
            {userLists.length === 0 ? (
              <div className="text-center py-6 rounded-xl bg-surface-hover/30">
                <List size={24} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-text-tertiary text-sm mb-3">
                  No custom smart lists yet
                </p>
                <AppButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => {
                    setEditingList(null);
                    setDialogOpen(true);
                  }}
                >
                  Create Your First List
                </AppButton>
              </div>
            ) : (
              <div className="space-y-2">
                {userLists.map((list) => (
                  <SmartListItem
                    key={list.list_id}
                    list={list}
                    isSelected={selectedListId === list.list_id}
                    isEvaluating={evaluatingListId === list.list_id}
                    onSelect={() => handleSelectList(list)}
                    onEdit={() => {
                      setEditingList(list);
                      setDialogOpen(true);
                    }}
                    onDelete={() => {
                      setDeletingList(list);
                      setDeleteDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <SmartListDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingList(null);
        }}
        workspaceId={workspaceId}
        editingList={editingList}
        onSaved={handleListSaved}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingList(null);
        }}
        onConfirm={handleDelete}
        deleteType="hard"
        entityType="smart list"
        entityName={deletingList?.name || ''}
        isLoading={isDeleting}
      />
    </div>
  );
};

/* =============================================================================
   SmartListItem Component
   ============================================================================= */

interface SmartListItemProps {
  list: SmartListWithCount;
  isSelected: boolean;
  isEvaluating: boolean;
  isSystem?: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SmartListItem: React.FC<SmartListItemProps> = ({
  list,
  isSelected,
  isEvaluating,
  isSystem = false,
  onSelect,
  onEdit,
  onDelete,
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
        isSelected
          ? 'bg-primary/10 border-2 border-primary'
          : 'bg-surface-hover/30 hover:bg-surface-hover/50 border-2 border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`p-2 rounded-lg ${
            isSelected ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-text-tertiary'
          }`}
        >
          {isEvaluating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            getListIcon(list.name)
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium truncate ${
                isSelected ? 'text-primary' : 'text-text-primary'
              }`}
            >
              {list.name}
            </span>
            {isSystem && (
              <AppBadge variant="default" size="sm">
                System
              </AppBadge>
            )}
          </div>
          {list.description && (
            <p className="text-xs text-text-tertiary truncate">
              {list.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AppBadge
          variant={isSelected ? 'primary' : 'default'}
          size="sm"
          icon={<Users size={12} />}
        >
          {list.client_count}
        </AppBadge>

        {!isSystem && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                aria-label="Edit list"
              >
                <Edit size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors"
                aria-label="Delete list"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}

        <ChevronRight
          size={16}
          className={`transition-transform ${
            isSelected ? 'text-primary rotate-90' : 'text-text-tertiary'
          }`}
        />
      </div>
    </motion.div>
  );
};

export default SmartListManager;
