/**
 * CreateListModal Component
 *
 * Modal dialog for creating a new favorite list.
 * Validates list name and handles creation via the favorites service.
 *
 * Feature: 012-client-favorites
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Folder, Loader2 } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface CreateListModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when list is created successfully */
  onCreate: (name: string) => Promise<void>;
  /** Whether creation is in progress */
  isCreating?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Maximum list name length */
  maxLength?: number;
}

export const CreateListModal: React.FC<CreateListModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isCreating = false,
  error = null,
  maxLength = 50,
}) => {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setLocalError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmedName = name.trim();
      if (!trimmedName) {
        setLocalError('Please enter a list name');
        return;
      }

      if (trimmedName.length > maxLength) {
        setLocalError(`List name must be ${maxLength} characters or less`);
        return;
      }

      setLocalError(null);
      await onCreate(trimmedName);
    },
    [name, maxLength, onCreate]
  );

  if (!isOpen) return null;

  const displayError = error || localError;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-list-title"
      >
        <div
          className="bg-surface rounded-xl shadow-2xl w-full max-w-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-primary" />
              <h2 id="create-list-title" className="text-lg font-semibold text-text-primary">
                Create New List
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-surface-hover transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label
                htmlFor="list-name"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                List Name
              </label>
              <input
                ref={inputRef}
                id="list-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., For Print, For Mom, Best Shots"
                className={`
                  w-full px-3 py-2.5 text-text-primary bg-surface-hover
                  border rounded-lg transition-colors
                  placeholder:text-text-tertiary
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                  ${displayError ? 'border-error' : 'border-border'}
                `}
                maxLength={maxLength}
                disabled={isCreating}
                aria-invalid={!!displayError}
                aria-describedby={displayError ? 'list-name-error' : undefined}
              />
              <div className="flex justify-between mt-1.5">
                {displayError ? (
                  <p id="list-name-error" className="text-sm text-error" role="alert">
                    {displayError}
                  </p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-text-tertiary">
                  {name.length}/{maxLength}
                </span>
              </div>
            </div>

            <p className="text-sm text-text-tertiary">
              Organize your favorites into lists to share or download separately.
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <AppButton
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </AppButton>
              <AppButton
                type="submit"
                variant="primary"
                disabled={!name.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create List'
                )}
              </AppButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateListModal;
