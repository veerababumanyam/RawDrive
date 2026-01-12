/**
 * ApprovalDialog Component
 * Confirmation dialog for client album approval
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { ApproveAlbumRequest } from '../../../types/album';

interface ApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (data: ApproveAlbumRequest) => Promise<void>;
  unresolvedCommentCount?: number;
  albumTitle: string;
}

export function ApprovalDialog({
  isOpen,
  onClose,
  onApprove,
  unresolvedCommentCount = 0,
  albumTitle,
}: ApprovalDialogProps) {
  const { t } = useTranslation('album');
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [acknowledgeUnresolved, setAcknowledgeUnresolved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasUnresolved = unresolvedCommentCount > 0;

  // Focus first input when dialog opens
  useEffect(() => {
    if (isOpen) {
      firstInputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle escape key and click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!clientName.trim()) {
        setError(t('approval.errors.nameRequired'));
        return;
      }

      if (!clientEmail.trim()) {
        setError(t('approval.errors.emailRequired'));
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clientEmail)) {
        setError(t('approval.errors.emailInvalid'));
        return;
      }

      if (hasUnresolved && !acknowledgeUnresolved) {
        setError(t('approval.errors.acknowledgeRequired'));
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await onApprove({
          client_name: clientName.trim(),
          client_email: clientEmail.trim(),
          acknowledge_unresolved: acknowledgeUnresolved,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('approval.errors.failed'));
        setIsSubmitting(false);
      }
    },
    [clientName, clientEmail, acknowledgeUnresolved, hasUnresolved, onApprove, onClose, t]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="approval-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {t('approval.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('approval.close')}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Album info */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('approval.confirmMessage')}
              </p>
              <p className="font-medium text-gray-900 dark:text-white mt-1">
                {albumTitle}
              </p>
            </div>
          </div>

          {/* Unresolved comments warning */}
          {hasUnresolved && (
            <div className="flex items-start gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {t('approval.unresolvedWarning')}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {t('approval.unresolvedCount', { count: unresolvedCommentCount })}
                </p>
                <label className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    checked={acknowledgeUnresolved}
                    onChange={(e) => setAcknowledgeUnresolved(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    {t('approval.acknowledgeCheckbox')}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Client name */}
          <div>
            <label
              htmlFor="client-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {t('approval.yourName')} <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              id="client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              disabled={isSubmitting}
            />
          </div>

          {/* Client email */}
          <div>
            <label
              htmlFor="client-email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {t('approval.yourEmail')} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="client-email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('approval.emailHint')}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('approval.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (hasUnresolved && !acknowledgeUnresolved)}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {t('approval.approve')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ApprovalDialog;
