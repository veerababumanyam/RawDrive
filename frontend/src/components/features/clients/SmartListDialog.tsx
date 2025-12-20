/**
 * SmartListDialog Component
 *
 * Dialog for creating and editing smart lists.
 * Requirements: 22.1 - Create/edit smart lists with filter criteria
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  List,
  Loader2,
  Save,
  Users,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { useToast } from '../../ui/Toast';
import { SmartListFilterBuilder } from './SmartListFilterBuilder';
import { clientService } from '../../../services/clientService';
import type {
  SmartList,
  SmartListFilterCriteria,
  ClientListItem,
  ClientTag,
} from '../../../types/client';

/* =============================================================================
   SmartListDialog Component
   ============================================================================= */

interface SmartListDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Smart list to edit (null for create) */
  editingList?: SmartList | null;
  /** Callback when list is saved */
  onSaved?: () => void;
}

const DEFAULT_CRITERIA: SmartListFilterCriteria = {
  type: 'and',
  conditions: [],
};

export const SmartListDialog: React.FC<SmartListDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  editingList,
  onSaved,
}) => {
  const { addToast } = useToast();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<SmartListFilterCriteria>(DEFAULT_CRITERIA);
  const [isSaving, setIsSaving] = useState(false);

  // Preview state
  const [previewClients, setPreviewClients] = useState<ClientListItem[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Available tags for autocomplete
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Initialize form when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (editingList) {
        setName(editingList.name);
        setDescription(editingList.description || '');
        setCriteria(editingList.filter_criteria);
      } else {
        setName('');
        setDescription('');
        setCriteria(DEFAULT_CRITERIA);
      }
      setPreviewClients([]);
      setShowPreview(false);
    }
  }, [isOpen, editingList]);

  // Fetch available tags
  useEffect(() => {
    if (isOpen && workspaceId) {
      clientService.getWorkspaceTags(workspaceId).then((tags: ClientTag[]) => {
        setAvailableTags(tags.map((t) => t.name));
      }).catch(() => {
        // Ignore errors
      });
    }
  }, [isOpen, workspaceId]);

  // Handle preview
  const handlePreview = useCallback(async () => {
    if (criteria.conditions.length === 0) {
      addToast({
        variant: 'warning',
        message: 'Add at least one filter condition to preview',
      });
      return;
    }

    setIsPreviewLoading(true);
    setShowPreview(true);
    try {
      // Create a temporary smart list to preview
      const tempList = await clientService.createSmartList(workspaceId, {
        name: `_temp_preview_${Date.now()}`,
        filter_criteria: criteria,
      });

      const result = await clientService.evaluateSmartList(
        workspaceId,
        tempList.list_id,
        { limit: 10 }
      );
      setPreviewClients(result.clients);

      // Delete the temporary list
      await clientService.deleteSmartList(workspaceId, tempList.list_id);
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to preview list',
      });
      setPreviewClients([]);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [workspaceId, criteria, addToast]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Validation
    if (!name.trim()) {
      addToast({
        variant: 'error',
        message: 'Please enter a name for the smart list',
      });
      return;
    }

    if (criteria.conditions.length === 0) {
      addToast({
        variant: 'error',
        message: 'Add at least one filter condition',
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingList) {
        await clientService.updateSmartList(workspaceId, editingList.list_id, {
          name: name.trim(),
          description: description.trim() || undefined,
          filter_criteria: criteria,
        });
      } else {
        await clientService.createSmartList(workspaceId, {
          name: name.trim(),
          description: description.trim() || undefined,
          filter_criteria: criteria,
        });
      }
      onSaved?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to save smart list',
      });
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, name, description, criteria, editingList, onSaved, addToast]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Dialog */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-list-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <List className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="smart-list-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  {editingList ? 'Edit Smart List' : 'Create Smart List'}
                </h2>
                <p className="text-sm text-text-secondary">
                  Define filter criteria to automatically group clients
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close dialog"
            >
              <X size={20} className="text-text-tertiary" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Name & Description */}
            <div className="space-y-4">
              <AppInput
                label="List Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., VIP Clients, Recent Leads"
                required
              />
              <AppInput
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this list is for..."
              />
            </div>

            {/* Filter Builder */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Filter Conditions
              </label>
              <SmartListFilterBuilder
                value={criteria}
                onChange={setCriteria}
                availableTags={availableTags}
              />
            </div>

            {/* Preview Section */}
            {showPreview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <Eye size={16} />
                    Preview (up to 10 clients)
                  </h3>
                  {previewClients.length > 0 && (
                    <span className="text-xs text-text-tertiary">
                      Showing {previewClients.length} matching clients
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  {isPreviewLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                  ) : previewClients.length === 0 ? (
                    <div className="text-center py-8 text-text-tertiary">
                      <Users size={24} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No clients match these criteria</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border max-h-[200px] overflow-y-auto">
                      {previewClients.map((client) => (
                        <div
                          key={client.client_id}
                          className="flex items-center gap-3 p-3 hover:bg-surface-hover/50"
                        >
                          {client.avatar_url ? (
                            <img
                              src={client.avatar_url}
                              alt={client.full_name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                              {client.initials || client.full_name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {client.full_name}
                            </p>
                            {client.organization && (
                              <p className="text-xs text-text-tertiary truncate">
                                {client.organization}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              client.status === 'active'
                                ? 'bg-success/10 text-success'
                                : 'bg-text-tertiary/10 text-text-tertiary'
                            }`}
                          >
                            {client.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border bg-surface flex-shrink-0">
            <AppButton
              variant="outline"
              onClick={handlePreview}
              disabled={criteria.conditions.length === 0 || isPreviewLoading}
              leftIcon={
                isPreviewLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Eye size={16} />
                )
              }
            >
              Preview
            </AppButton>
            <div className="flex items-center gap-3">
              <AppButton variant="outline" onClick={onClose}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleSave}
                disabled={isSaving || !name.trim() || criteria.conditions.length === 0}
                leftIcon={
                  isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )
                }
              >
                {isSaving ? 'Saving...' : editingList ? 'Update List' : 'Create List'}
              </AppButton>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SmartListDialog;
