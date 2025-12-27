/**
 * DeleteConfirmModal Component
 * Confirmation modal for deleting Gemini models.
 * Feature: 003-user-gemini-settings
 */

import React, { useState, useEffect, useRef } from 'react';
import { Trash2, AlertCircle, Users } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import type { GeminiModelAdmin } from '../../../types/geminiSettings';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  model: GeminiModelAdmin | null;
  isLoading: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  model,
  isLoading,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
    }
  };

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus cancel button on open (safer default for destructive dialogs)
    const timer = setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        );
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !model) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="glass-card rounded-2xl w-full max-w-md shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-desc"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-error/10">
              <Trash2 className="w-6 h-6 text-error" />
            </div>
            <h2 id="delete-confirm-title" className="text-xl font-semibold text-text-primary">
              Delete Model
            </h2>
          </div>

          <p id="delete-confirm-desc" className="text-text-secondary mb-4">
            Are you sure you want to delete <strong>{model.display_name}</strong>?
          </p>

          {model.user_count > 0 && (
            <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg text-warning text-sm mb-4">
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>
                {model.user_count} user{model.user_count > 1 ? 's' : ''} will be migrated to the
                default model.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <AppButton ref={cancelButtonRef} type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Deleting...' : 'Delete Model'}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
