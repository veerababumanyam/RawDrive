/**
 * ClientExportDialog Component
 *
 * Dialog for exporting clients to CSV or JSON.
 * Requirements: 14.2 - Select format, filters, download file
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Download,
  FileText,
  FileJson,
  Loader2,
  Check,
  Filter,
  Users,
  Tag,
  Mail,
  MapPin,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type { ExportFormat, ClientStatus, ClientTag } from '../../../types/client';

/* =============================================================================
   ClientExportDialog Component
   ============================================================================= */

interface ClientExportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Pre-selected status filter */
  initialStatus?: ClientStatus;
  /** Pre-selected tag IDs */
  initialTagIds?: string[];
  /** Callback when export is complete */
  onExportComplete?: () => void;
}

export const ClientExportDialog: React.FC<ClientExportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  initialStatus,
  initialTagIds = [],
  onExportComplete,
}) => {
  const { addToast } = useToast();

  // State
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [status, setStatus] = useState<ClientStatus | 'all'>(initialStatus || 'all');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds);
  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeAddresses, setIncludeAddresses] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);

  // Fetch available tags
  useEffect(() => {
    if (isOpen && workspaceId) {
      clientService.getWorkspaceTags(workspaceId).then(setAvailableTags).catch(() => {
        // Ignore errors
      });
    }
  }, [isOpen, workspaceId]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormat('csv');
      setStatus(initialStatus || 'all');
      setSelectedTagIds(initialTagIds);
      setIncludeContacts(true);
      setIncludeAddresses(true);
      setIncludeTags(true);
    }
  }, [isOpen, initialStatus, initialTagIds]);

  // Handle export
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await clientService.exportClients(workspaceId, {
        format,
        status: status !== 'all' ? status : undefined,
        tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        include_contacts: includeContacts,
        include_addresses: includeAddresses,
        include_tags: includeTags,
      });

      // Download file
      const blob = new Blob([result.content], { type: result.content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast({
        variant: 'success',
        message: `Successfully exported ${result.count} clients`,
      });
      onExportComplete?.();
      onClose();
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to export clients',
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    workspaceId,
    format,
    status,
    selectedTagIds,
    includeContacts,
    includeAddresses,
    includeTags,
    addToast,
    onClose,
  ]);

  // Toggle tag selection
  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }, []);

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
          className="relative w-full max-w-lg max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="export-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Export Clients
                </h2>
                <p className="text-sm text-text-secondary">
                  Download your client data
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
            {/* Format Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('csv')}
                  className={`flex items-center gap-3 p-4 rounded-xl text-left transition-all ${
                    format === 'csv'
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      format === 'csv'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    <FileText size={20} />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        format === 'csv' ? 'text-primary' : 'text-text-primary'
                      }`}
                    >
                      CSV
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Spreadsheet compatible
                    </p>
                  </div>
                  {format === 'csv' && (
                    <Check
                      size={16}
                      className="ml-auto text-primary"
                    />
                  )}
                </button>

                <button
                  onClick={() => setFormat('json')}
                  className={`flex items-center gap-3 p-4 rounded-xl text-left transition-all ${
                    format === 'json'
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      format === 'json'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    <FileJson size={20} />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        format === 'json' ? 'text-primary' : 'text-text-primary'
                      }`}
                    >
                      JSON
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Structured data
                    </p>
                  </div>
                  {format === 'json' && (
                    <Check
                      size={16}
                      className="ml-auto text-primary"
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
                <Filter size={14} />
                Filter by Status
              </label>
              <div className="flex gap-2">
                {(['all', 'active', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      status === s
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-text-primary hover:bg-surface-hover/80'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
                  <Tag size={14} />
                  Filter by Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.tag_id}
                      onClick={() => toggleTag(tag.tag_id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        selectedTagIds.includes(tag.tag_id)
                          ? 'bg-primary text-white'
                          : 'bg-surface-hover text-text-primary hover:bg-surface-hover/80'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: selectedTagIds.includes(tag.tag_id)
                            ? '#fff'
                            : tag.color || '#6B7280',
                        }}
                      />
                      {tag.name}
                    </button>
                  ))}
                </div>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={() => setSelectedTagIds([])}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear all tags
                  </button>
                )}
              </div>
            )}

            {/* Include Options */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Include Data
              </label>
              <div className="space-y-2">
                <ToggleOption
                  icon={<Mail size={16} />}
                  label="Contacts"
                  description="Email, phone, social media"
                  checked={includeContacts}
                  onChange={setIncludeContacts}
                />
                <ToggleOption
                  icon={<MapPin size={16} />}
                  label="Addresses"
                  description="Home, work, billing addresses"
                  checked={includeAddresses}
                  onChange={setIncludeAddresses}
                />
                <ToggleOption
                  icon={<Tag size={16} />}
                  label="Tags"
                  description="Client categories and labels"
                  checked={includeTags}
                  onChange={setIncludeTags}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border bg-surface flex-shrink-0">
            <div className="text-sm text-text-tertiary flex items-center gap-1">
              <Users size={14} />
              <span>Exporting to {format.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-3">
              <AppButton variant="outline" onClick={onClose}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleExport}
                disabled={isExporting}
                leftIcon={
                  isExporting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )
                }
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </AppButton>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/* =============================================================================
   ToggleOption Component
   ============================================================================= */

interface ToggleOptionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleOption: React.FC<ToggleOptionProps> = ({
  icon,
  label,
  description,
  checked,
  onChange,
}) => {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
        checked
          ? 'bg-primary/10 border border-primary/30'
          : 'bg-surface-hover/50 border border-transparent hover:border-border'
      }`}
    >
      <div
        className={`p-2 rounded-lg ${
          checked ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-text-tertiary'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p
          className={`font-medium ${
            checked ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {label}
        </p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          checked ? 'border-primary bg-primary text-white' : 'border-text-tertiary'
        }`}
      >
        {checked && <Check size={12} />}
      </div>
    </button>
  );
};

export default ClientExportDialog;
