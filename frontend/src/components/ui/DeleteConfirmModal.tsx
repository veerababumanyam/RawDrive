/**
 * Delete Confirmation Modal
 * 
 * A glassmorphism-styled modal for confirming destructive actions
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  itemCount: number;
  itemType?: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  itemCount,
  itemType = 'asset',
}) => {
  if (!isOpen) return null;

  const itemLabel = itemCount === 1 ? itemType : `${itemType}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isDeleting ? onClose : undefined}
      />
      
      {/* Modal */}
      <div className="relative glass-card rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Delete {itemCount} {itemLabel}?
          </h2>
          <p className="text-text-secondary text-sm">
            This action will move the selected {itemLabel} to the trash. 
            You can restore them from the Trash within 30 days.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 bg-surface hover:bg-surface-hover text-text-primary rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
