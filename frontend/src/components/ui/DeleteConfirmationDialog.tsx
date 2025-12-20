import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from './Modal';
import { AppButton } from './AppButton';
import { AppInput } from './AppInput';

/* =============================================================================
   Delete Confirmation Dialog Component

   A specialized confirmation dialog for delete operations with support for:
   - Soft delete (recycle bin) vs permanent delete
   - Name confirmation for large deletions (100+ photos)
   - Photo count display
   - Retention period information
   ============================================================================= */

export type DeleteType = 'soft' | 'permanent' | 'hard';
export type EntityType = 'gallery' | 'photo' | 'client' | 'smart list' | 'gallery link';

export interface DeleteConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when delete is confirmed */
  onConfirm: () => void | Promise<void>;
  /** Type of delete operation */
  deleteType: DeleteType;
  /** Type of entity being deleted */
  entityType: EntityType;
  /** Name of the entity (gallery title or photo filename) */
  entityName: string;
  /** Number of photos (for galleries) */
  photoCount?: number;
  /** Threshold for requiring name confirmation */
  nameConfirmationThreshold?: number;
  /** Retention period in days (for soft delete) */
  retentionDays?: number;
  /** Loading state */
  isLoading?: boolean;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  deleteType,
  entityType,
  entityName,
  photoCount = 0,
  nameConfirmationThreshold = 100,
  retentionDays = 30,
  isLoading = false,
}) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Determine if name confirmation is required
  const requiresNameConfirmation =
    deleteType === 'permanent' ||
    deleteType === 'hard' ||
    (entityType === 'gallery' && photoCount >= nameConfirmationThreshold);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (requiresNameConfirmation) {
      if (confirmationText !== entityName) {
        setError('Name does not match. Please type the exact name to confirm.');
        return;
      }
    }

    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [requiresNameConfirmation, confirmationText, entityName, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleConfirm();
      }
    },
    [handleConfirm, isLoading]
  );

  const entityLabel =
    entityType === 'gallery' ? 'Gallery' :
    entityType === 'client' ? 'Client' :
    entityType === 'smart list' ? 'Smart List' :
    entityType === 'gallery link' ? 'Gallery Link' :
    'Photo';

  const title =
    deleteType === 'permanent' || deleteType === 'hard'
      ? `Permanently Delete ${entityLabel}`
      : `Delete ${entityLabel}`;

  const confirmButtonText =
    deleteType === 'permanent' || deleteType === 'hard' ? 'Permanently Delete' : 'Move to Recycle Bin';

  const isConfirmDisabled =
    isLoading || (requiresNameConfirmation && confirmationText !== entityName);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader bordered={false}>
        <div className="flex items-center gap-3">
          <div
            className={`
              flex items-center justify-center
              w-10 h-10 rounded-full
              ${
                deleteType === 'permanent'
                  ? 'bg-error/10 text-error'
                  : 'bg-warning/10 text-warning'
              }
            `}
          >
            {deleteType === 'permanent' ? (
              <Trash2 size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
          </div>
          <div>
            <ModalTitle>{title}</ModalTitle>
            <ModalDescription>
              {entityType === 'gallery' ? `"${entityName}"` : entityName}
              {photoCount > 0 && ` (${photoCount} photo${photoCount !== 1 ? 's' : ''})`}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody padding="md">
        <div className="space-y-4">
          {/* Warning message */}
          <div
            className={`
              p-3 rounded-lg text-sm
              ${
                deleteType === 'permanent' || deleteType === 'hard'
                  ? 'bg-error/10 text-error border border-error/20'
                  : 'bg-warning/10 text-warning-600 dark:text-warning-400 border border-warning/20'
              }
            `}
          >
            {deleteType === 'permanent' || deleteType === 'hard' ? (
              <>
                <strong>Warning:</strong> This action cannot be undone.
                {entityType === 'client'
                  ? ' This client and all associated data will be permanently deleted.'
                  : ' All files will be permanently deleted from storage.'}
              </>
            ) : (
              <>
                This {entityType} will be moved to the Recycle Bin.
                {retentionDays > 0 && (
                  <>
                    {' '}
                    It will be automatically deleted after{' '}
                    <strong>{retentionDays} days</strong>.
                  </>
                )}
              </>
            )}
          </div>

          {/* Name confirmation input */}
          {requiresNameConfirmation && (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                To confirm, type{' '}
                <strong className="text-text-primary">{entityName}</strong>{' '}
                below:
              </p>
              <AppInput
                value={confirmationText}
                onChange={(e) => {
                  setConfirmationText(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={`Type "${entityName}" to confirm`}
                error={error || undefined}
                disabled={isLoading}
                autoFocus
                aria-label="Confirmation text"
              />
            </div>
          )}

          {/* Photo count for galleries */}
          {entityType === 'gallery' && photoCount > 0 && (
            <p className="text-sm text-text-tertiary">
              {deleteType === 'permanent'
                ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} will be permanently deleted.`
                : `${photoCount} photo${photoCount !== 1 ? 's' : ''} will also be moved to the Recycle Bin.`}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter bordered>
        <AppButton
          variant="secondary"
          onClick={onClose}
          disabled={isLoading}
        >
          Cancel
        </AppButton>
        <AppButton
          variant="destructive"
          onClick={handleConfirm}
          isLoading={isLoading}
          disabled={isConfirmDisabled}
        >
          {confirmButtonText}
        </AppButton>
      </ModalFooter>
    </Modal>
  );
};

/* =============================================================================
   Bulk Delete Confirmation Dialog Component

   Specialized dialog for bulk delete operations.
   ============================================================================= */

export interface BulkDeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  deleteType: DeleteType;
  /** Number of items selected for deletion */
  itemCount: number;
  /** Type of items being deleted */
  itemType: 'galleries' | 'photos' | 'mixed';
  /** Retention period in days */
  retentionDays?: number;
  isLoading?: boolean;
}

export const BulkDeleteConfirmationDialog: React.FC<
  BulkDeleteConfirmationDialogProps
> = ({
  isOpen,
  onClose,
  onConfirm,
  deleteType,
  itemCount,
  itemType,
  retentionDays = 30,
  isLoading = false,
}) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // For permanent delete, require typing "DELETE" to confirm
  const requiresConfirmation = deleteType === 'permanent';
  const confirmationKeyword = 'DELETE';

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (requiresConfirmation && confirmationText !== confirmationKeyword) {
      setError(`Please type "${confirmationKeyword}" to confirm.`);
      return;
    }

    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [requiresConfirmation, confirmationText, onConfirm]);

  const getItemTypeLabel = () => {
    switch (itemType) {
      case 'galleries':
        return itemCount === 1 ? 'gallery' : 'galleries';
      case 'photos':
        return itemCount === 1 ? 'photo' : 'photos';
      case 'mixed':
        return itemCount === 1 ? 'item' : 'items';
    }
  };

  const title =
    deleteType === 'permanent'
      ? `Permanently Delete ${itemCount} ${getItemTypeLabel()}`
      : `Delete ${itemCount} ${getItemTypeLabel()}`;

  const isConfirmDisabled =
    isLoading ||
    (requiresConfirmation && confirmationText !== confirmationKeyword);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader bordered={false}>
        <div className="flex items-center gap-3">
          <div
            className={`
              flex items-center justify-center
              w-10 h-10 rounded-full
              ${
                deleteType === 'permanent'
                  ? 'bg-error/10 text-error'
                  : 'bg-warning/10 text-warning'
              }
            `}
          >
            <Trash2 size={20} />
          </div>
          <ModalTitle>{title}</ModalTitle>
        </div>
      </ModalHeader>

      <ModalBody padding="md">
        <div className="space-y-4">
          <div
            className={`
              p-3 rounded-lg text-sm
              ${
                deleteType === 'permanent'
                  ? 'bg-error/10 text-error border border-error/20'
                  : 'bg-warning/10 text-warning-600 dark:text-warning-400 border border-warning/20'
              }
            `}
          >
            {deleteType === 'permanent' ? (
              <>
                <strong>Warning:</strong> This action cannot be undone. All
                selected items and their files will be permanently deleted.
              </>
            ) : (
              <>
                Selected items will be moved to the Recycle Bin.
                {retentionDays > 0 && (
                  <>
                    {' '}
                    They will be automatically deleted after{' '}
                    <strong>{retentionDays} days</strong>.
                  </>
                )}
              </>
            )}
          </div>

          {requiresConfirmation && (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                To confirm, type{' '}
                <strong className="text-text-primary font-mono">
                  {confirmationKeyword}
                </strong>{' '}
                below:
              </p>
              <AppInput
                value={confirmationText}
                onChange={(e) => {
                  setConfirmationText(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder={`Type "${confirmationKeyword}" to confirm`}
                error={error || undefined}
                disabled={isLoading}
                autoFocus
                className="font-mono"
              />
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter bordered>
        <AppButton variant="secondary" onClick={onClose} disabled={isLoading}>
          Cancel
        </AppButton>
        <AppButton
          variant="destructive"
          onClick={handleConfirm}
          isLoading={isLoading}
          disabled={isConfirmDisabled}
        >
          {deleteType === 'permanent'
            ? 'Permanently Delete'
            : 'Move to Recycle Bin'}
        </AppButton>
      </ModalFooter>
    </Modal>
  );
};

export default DeleteConfirmationDialog;
