/**
 * useConfirmDialog hook
 *
 * Provides a simple confirmation dialog state manager.
 * This hook manages dialog visibility and confirmation callbacks.
 *
 * Note: For delete-specific dialogs, use the DeleteConfirmationDialog component directly.
 */

import { useState, useCallback } from 'react';

export interface ConfirmDialogOptions {
  /** Title of the confirmation dialog */
  title: string;
  /** Description/message of the dialog */
  description?: string;
  /** Alias for description */
  message?: string;
  /** Text for the confirm button */
  confirmText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Variant for the confirm button */
  variant?: 'primary' | 'destructive' | 'warning';
}

export interface UseConfirmDialogReturn {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current dialog options */
  options: ConfirmDialogOptions | null;
  /** Open the dialog with options and return a promise that resolves when confirmed/cancelled */
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  /** Close the dialog (cancel) */
  cancel: () => void;
  /** Confirm the action */
  handleConfirm: () => void;
  /** Cancel the action */
  handleCancel: () => void;
}

/**
 * Hook for managing confirmation dialog state.
 *
 * @example
 * ```tsx
 * const { confirm, isOpen, options, handleConfirm, handleCancel } = useConfirmDialog();
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Delete Item?',
 *     description: 'This action cannot be undone.',
 *     confirmText: 'Delete',
 *     variant: 'destructive',
 *   });
 *
 *   if (confirmed) {
 *     // Perform delete
 *   }
 * };
 * ```
 */
export function useConfirmDialog(): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setResolveRef(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(true);
    setResolveRef(null);
    setOptions(null);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(false);
    setResolveRef(null);
    setOptions(null);
  }, [resolveRef]);

  const cancel = handleCancel;

  return {
    isOpen,
    options,
    confirm,
    cancel,
    handleConfirm,
    handleCancel,
  };
}

export default useConfirmDialog;
