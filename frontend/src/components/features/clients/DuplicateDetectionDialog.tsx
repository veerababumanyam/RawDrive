/**
 * DuplicateDetectionDialog Component
 *
 * Shows potential duplicate clients when creating a new client.
 * Requirements: 23.1, 23.2, 23.5 - Detect duplicates, show confidence, mark as not duplicate
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  Users,
  Mail,
  Phone,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import type { DuplicateClient } from '../../../types/client';

/* =============================================================================
   DuplicateDetectionDialog Component
   ============================================================================= */

interface DuplicateDetectionDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Potential duplicates */
  duplicates: DuplicateClient[];
  /** Overall confidence score */
  confidence: number;
  /** Callback when user confirms it's not a duplicate */
  onConfirmNotDuplicate: () => void;
  /** Callback when user selects an existing client */
  onSelectExisting: (clientId: string) => void;
  /** Callback when user wants to merge */
  onMerge: (clientId: string) => void;
  /** Whether actions are loading */
  isLoading?: boolean;
}

// Get confidence badge variant
const getConfidenceBadge = (confidence: number): 'error' | 'warning' | 'info' => {
  if (confidence >= 0.9) return 'error';
  if (confidence >= 0.7) return 'warning';
  return 'info';
};

// Get confidence label
const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 0.9) return 'Very High';
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
};

export const DuplicateDetectionDialog: React.FC<DuplicateDetectionDialogProps> = ({
  isOpen,
  onClose,
  duplicates,
  confidence,
  onConfirmNotDuplicate,
  onSelectExisting,
  onMerge,
  isLoading = false,
}) => {
  const [selectedAction, setSelectedAction] = useState<'not_duplicate' | 'use_existing' | 'merge' | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Handle action selection
  const handleConfirm = useCallback(() => {
    if (selectedAction === 'not_duplicate') {
      onConfirmNotDuplicate();
    } else if (selectedAction === 'use_existing' && selectedClientId) {
      onSelectExisting(selectedClientId);
    } else if (selectedAction === 'merge' && selectedClientId) {
      onMerge(selectedClientId);
    }
  }, [selectedAction, selectedClientId, onConfirmNotDuplicate, onSelectExisting, onMerge]);

  // Reset selection when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedAction(null);
      setSelectedClientId(null);
    }
  }, [isOpen]);

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
          aria-labelledby="duplicate-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h2
                  id="duplicate-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Possible Duplicates Found
                </h2>
                <p className="text-sm text-text-secondary">
                  We found {duplicates.length} potential match
                  {duplicates.length !== 1 ? 'es' : ''}
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
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Overall Confidence */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-hover/50">
              <span className="text-sm text-text-secondary">
                Overall Confidence
              </span>
              <AppBadge variant={getConfidenceBadge(confidence)} size="sm">
                {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
              </AppBadge>
            </div>

            {/* Duplicate List */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                Matching Clients
              </h3>
              <div className="space-y-2">
                {duplicates.map((duplicate) => (
                  <DuplicateClientCard
                    key={duplicate.client_id}
                    duplicate={duplicate}
                    isSelected={selectedClientId === duplicate.client_id}
                    onSelect={() => {
                      setSelectedClientId(duplicate.client_id);
                      if (!selectedAction || selectedAction === 'not_duplicate') {
                        setSelectedAction('use_existing');
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Action Options */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                What would you like to do?
              </h3>
              <div className="space-y-2">
                {/* Not a Duplicate */}
                <button
                  onClick={() => {
                    setSelectedAction('not_duplicate');
                    setSelectedClientId(null);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                    selectedAction === 'not_duplicate'
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      selectedAction === 'not_duplicate'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    <XCircle size={18} />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        selectedAction === 'not_duplicate'
                          ? 'text-primary'
                          : 'text-text-primary'
                      }`}
                    >
                      Not a duplicate
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Continue creating a new client
                    </p>
                  </div>
                </button>

                {/* Use Existing */}
                <button
                  onClick={() => setSelectedAction('use_existing')}
                  disabled={!selectedClientId}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                    selectedAction === 'use_existing'
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
                  } ${!selectedClientId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      selectedAction === 'use_existing'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        selectedAction === 'use_existing'
                          ? 'text-primary'
                          : 'text-text-primary'
                      }`}
                    >
                      Use existing client
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {selectedClientId
                        ? 'Switch to the selected client'
                        : 'Select a client above'}
                    </p>
                  </div>
                </button>

                {/* Merge */}
                <button
                  onClick={() => setSelectedAction('merge')}
                  disabled={!selectedClientId}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                    selectedAction === 'merge'
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
                  } ${!selectedClientId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      selectedAction === 'merge'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    <Users size={18} />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        selectedAction === 'merge'
                          ? 'text-primary'
                          : 'text-text-primary'
                      }`}
                    >
                      Merge with existing
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {selectedClientId
                        ? 'Combine data with the selected client'
                        : 'Select a client above'}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface flex-shrink-0">
            <AppButton variant="outline" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleConfirm}
              disabled={!selectedAction || isLoading}
              leftIcon={
                isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowRight size={16} />
                )
              }
            >
              {isLoading
                ? 'Processing...'
                : selectedAction === 'not_duplicate'
                ? 'Continue Creating'
                : selectedAction === 'use_existing'
                ? 'Use Existing'
                : selectedAction === 'merge'
                ? 'Merge Clients'
                : 'Continue'}
            </AppButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/* =============================================================================
   DuplicateClientCard Component
   ============================================================================= */

interface DuplicateClientCardProps {
  duplicate: DuplicateClient;
  isSelected: boolean;
  onSelect: () => void;
}

const DuplicateClientCard: React.FC<DuplicateClientCardProps> = ({
  duplicate,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
        isSelected
          ? 'bg-primary/10 border-2 border-primary'
          : 'bg-surface-hover/50 border-2 border-transparent hover:border-border'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'bg-surface-hover text-text-tertiary'
        }`}
      >
        {duplicate.full_name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium truncate ${
            isSelected ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {duplicate.full_name}
        </p>
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          {duplicate.primary_email && (
            <span className="flex items-center gap-1 truncate">
              <Mail size={12} />
              {duplicate.primary_email}
            </span>
          )}
          {duplicate.primary_phone && (
            <span className="flex items-center gap-1">
              <Phone size={12} />
              {duplicate.primary_phone}
            </span>
          )}
        </div>
      </div>

      {/* Confidence */}
      <AppBadge
        variant={getConfidenceBadge(duplicate.confidence)}
        size="sm"
      >
        {Math.round(duplicate.confidence * 100)}% match
      </AppBadge>
    </button>
  );
};

export default DuplicateDetectionDialog;
