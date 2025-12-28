/**
 * AccountTabContent Component
 *
 * Account management tab content - danger zone with account deletion.
 * Mirrors AccountSettingsPage structure for tabbed navigation.
 */

import { useState, useCallback } from 'react';
import {
  AlertTriangle,
  Trash2,
  Loader2,
  AlertCircle,
  Calendar,
  XCircle,
  CheckCircle,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '../ui/Modal';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { useAccountDeletion } from '../../hooks/useUserSettings';
import { useToastActions } from '../ui/Toast';
import type { TabContentProps } from '../../types/settings';

export function AccountTabContent({ className }: TabContentProps) {
  const { deletionStatus, loading, error, refetch, requestDeletion, cancelDeletion } =
    useAccountDeletion();
  const toast = useToastActions();

  // Modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Form state
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form state
  const resetForm = useCallback(() => {
    setPassword('');
    setReason('');
    setConfirmText('');
    setFormError(null);
  }, []);

  // Handle opening delete modal
  const handleOpenDeleteModal = useCallback(() => {
    resetForm();
    setIsDeleteModalOpen(true);
  }, [resetForm]);

  // Handle closing delete modal
  const handleCloseDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    resetForm();
  }, [resetForm]);

  // Handle deletion request submission
  const handleRequestDeletion = useCallback(async () => {
    // Validate inputs
    if (!password) {
      setFormError('Password is required');
      return;
    }

    if (confirmText !== 'DELETE MY ACCOUNT') {
      setFormError('Please type "DELETE MY ACCOUNT" exactly to confirm');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await requestDeletion(password, reason || undefined);
      toast.success('Account deletion scheduled. You have 30 days to cancel.');
      handleCloseDeleteModal();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request deletion';
      // Handle specific error cases
      if (errorMessage.includes('password') || errorMessage.includes('Invalid')) {
        setFormError('Incorrect password. Please try again.');
      } else if (errorMessage.includes('already')) {
        setFormError('A deletion request already exists for this account.');
      } else {
        setFormError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [password, reason, confirmText, requestDeletion, toast, handleCloseDeleteModal]);

  // Handle cancellation
  const handleCancelDeletion = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await cancelDeletion();
      toast.success('Account deletion cancelled successfully.');
      setIsCancelModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel deletion');
    } finally {
      setIsSubmitting(false);
    }
  }, [cancelDeletion, toast]);

  // Format date for display
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Loading state
  if (loading && !deletionStatus) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Error state
  if (error && !deletionStatus) {
    return (
      <div className="p-6 bg-error/10 rounded-xl text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-error mb-3" />
        <p className="text-error font-medium">{error.message}</p>
        <AppButton variant="outline" onClick={refetch} className="mt-4">
          Try Again
        </AppButton>
      </div>
    );
  }

  const hasPendingDeletion = deletionStatus?.has_pending_deletion ?? false;

  return (
    <div className={`space-y-8 ${className || ''}`}>
      {/* Description */}
      <p className="text-text-secondary">
        Manage your account status and deletion options.
      </p>

      {/* Pending deletion status */}
      {hasPendingDeletion && deletionStatus && (
        <div className="bg-error/5 border border-error/20 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-3 bg-error/10 rounded-full">
              <Clock className="w-6 h-6 text-error" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-error">
                Account Deletion Scheduled
              </h2>
              <p className="text-text-secondary mt-1">
                Your account is scheduled for permanent deletion. All your data, including
                photos, galleries, and settings will be permanently removed.
              </p>
            </div>
          </div>

          {/* Deletion details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-error/20">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-text-tertiary" />
              <div>
                <p className="text-sm text-text-tertiary">Scheduled Deletion</p>
                <p className="text-text-primary font-medium">
                  {formatDate(deletionStatus.scheduled_deletion_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="text-sm text-text-tertiary">Time Remaining</p>
                <p className="text-text-primary font-medium">
                  {deletionStatus.days_until_deletion !== null
                    ? `${deletionStatus.days_until_deletion} day${deletionStatus.days_until_deletion !== 1 ? 's' : ''}`
                    : 'Processing...'}
                </p>
              </div>
            </div>
          </div>

          {/* Cancel button */}
          {deletionStatus.can_cancel && (
            <div className="pt-4 border-t border-error/20">
              <AppButton
                variant="outline"
                onClick={() => setIsCancelModalOpen(true)}
                className="w-full sm:w-auto"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Deletion Request
              </AppButton>
            </div>
          )}
        </div>
      )}

      {/* Delete account section (only show if no pending deletion) */}
      {!hasPendingDeletion && (
        <div className="bg-surface border border-border rounded-xl">
          {/* Section header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 p-2 bg-error/10 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-error" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Danger Zone</h2>
                <p className="text-sm text-text-secondary">
                  Irreversible account actions
                </p>
              </div>
            </div>
          </div>

          {/* Delete account option */}
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-medium text-text-primary">Delete Account</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Permanently delete your account and all associated data. This action
                  includes a 30-day grace period during which you can cancel the request.
                </p>
              </div>
              <AppButton variant="destructive" onClick={handleOpenDeleteModal}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </AppButton>
            </div>

            {/* Warning about what will be deleted */}
            <div className="mt-6 p-4 bg-warning/5 border border-warning/20 rounded-lg">
              <h4 className="font-medium text-warning-600 dark:text-warning-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                What will be deleted:
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-text-secondary list-disc list-inside">
                <li>All photos and galleries</li>
                <li>Client information and history</li>
                <li>Workspace settings and preferences</li>
                <li>Subscription and billing history</li>
                <li>All account data and metadata</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Info text */}
      <div className="p-4 bg-surface-hover rounded-xl text-sm text-text-secondary">
        <p>
          <strong className="text-text-primary">Need help?</strong> If you&apos;re having
          issues with your account, our support team is here to help. Contact us at{' '}
          <a
            href="mailto:support@rawdrive.com"
            className="text-primary hover:underline"
          >
            support@rawdrive.com
          </a>{' '}
          before deciding to delete your account.
        </p>
      </div>

      {/* Delete account confirmation modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={handleCloseDeleteModal} size="md">
        <ModalHeader bordered={false}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-error/10 text-error">
              <Trash2 size={20} />
            </div>
            <div>
              <ModalTitle>Delete Your Account</ModalTitle>
              <ModalDescription>
                This action cannot be undone after the grace period
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody padding="md">
          <div className="space-y-5">
            {/* Warning banner */}
            <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-error">
                    Your account will be permanently deleted in 30 days
                  </p>
                  <p className="text-error/80 mt-1">
                    During this grace period, you can cancel the deletion request and
                    restore your account. After 30 days, all your data will be
                    permanently removed and cannot be recovered.
                  </p>
                </div>
              </div>
            </div>

            {/* Reason input (optional) */}
            <div>
              <label
                htmlFor="deletion-reason"
                className="block text-sm font-medium text-text-primary mb-2"
              >
                Reason for leaving (optional)
              </label>
              <textarea
                id="deletion-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Help us improve by sharing why you're leaving..."
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg
                  text-text-primary placeholder:text-text-tertiary resize-none
                  focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                  disabled:opacity-50 disabled:cursor-not-allowed"
                rows={3}
                maxLength={500}
                disabled={isSubmitting}
              />
              <p className="text-xs text-text-tertiary mt-1">
                {reason.length}/500 characters
              </p>
            </div>

            {/* Password verification */}
            <div>
              <label
                htmlFor="deletion-password"
                className="block text-sm font-medium text-text-primary mb-2"
              >
                Enter your password to confirm
              </label>
              <AppInput
                id="deletion-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormError(null);
                }}
                placeholder="Your current password"
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>

            {/* Confirmation text - case-sensitive to increase friction */}
            <div>
              <label
                htmlFor="deletion-confirm"
                className="block text-sm font-medium text-text-primary mb-2"
              >
                Type{' '}
                <span className="font-mono bg-surface-hover px-1.5 py-0.5 rounded text-error">
                  DELETE MY ACCOUNT
                </span>{' '}
                exactly to confirm
              </label>
              <AppInput
                id="deletion-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  setFormError(null);
                }}
                placeholder="Type DELETE MY ACCOUNT (case-sensitive)"
                disabled={isSubmitting}
                className="font-mono"
              />
            </div>

            {/* Form error */}
            {formError && (
              <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter bordered>
          <AppButton
            variant="secondary"
            onClick={handleCloseDeleteModal}
            disabled={isSubmitting}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            onClick={handleRequestDeletion}
            isLoading={isSubmitting}
            disabled={
              isSubmitting ||
              !password ||
              confirmText !== 'DELETE MY ACCOUNT'
            }
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete My Account
          </AppButton>
        </ModalFooter>
      </Modal>

      {/* Cancel deletion confirmation modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        size="sm"
      >
        <ModalHeader bordered={false}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/10 text-success">
              <CheckCircle size={20} />
            </div>
            <div>
              <ModalTitle>Keep Your Account</ModalTitle>
              <ModalDescription>Cancel the pending deletion request</ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody padding="md">
          <p className="text-text-secondary">
            Are you sure you want to cancel the account deletion? Your account will be
            restored and all your data will remain intact.
          </p>
        </ModalBody>

        <ModalFooter bordered>
          <AppButton
            variant="secondary"
            onClick={() => setIsCancelModalOpen(false)}
            disabled={isSubmitting}
          >
            Go Back
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleCancelDeletion}
            isLoading={isSubmitting}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Keep My Account
          </AppButton>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default AccountTabContent;
