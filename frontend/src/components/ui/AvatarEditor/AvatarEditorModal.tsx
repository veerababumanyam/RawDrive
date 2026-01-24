/**
 * AvatarEditorModal Component
 *
 * Modal wrapper for the Avatar Editor with glassmorphism design.
 * Features:
 * - Backdrop blur effect
 * - Light/dark theme support
 * - Responsive layout (mobile full-screen, tablet/desktop centered)
 * - Focus trap for accessibility
 * - Close confirmation when dirty
 * - Animation on open/close
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { AvatarEditor } from './AvatarEditor';
import { AppButton } from '../AppButton';
import { AvatarEditorModalProps, CropData } from './types';

// =============================================================================
// Animation Variants (with reduced motion alternatives)
// =============================================================================

const getBackdropVariants = (reduceMotion: boolean | null) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: reduceMotion ? 0 : 0.2 } },
  exit: { opacity: 0, transition: { duration: reduceMotion ? 0 : 0.15 } },
});

const getModalVariants = (reduceMotion: boolean | null) => ({
  hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 },
  visible: reduceMotion
    ? { opacity: 1, transition: { duration: 0 } }
    : {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
          type: 'spring',
          damping: 25,
          stiffness: 300,
        },
      },
  exit: reduceMotion
    ? { opacity: 0, transition: { duration: 0 } }
    : {
        opacity: 0,
        scale: 0.95,
        y: 20,
        transition: {
          duration: 0.15,
        },
      },
});

// =============================================================================
// Confirmation Dialog
// =============================================================================

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reduceMotion?: boolean | null;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, onConfirm, onCancel, reduceMotion }) => {
  if (!isOpen) return null;

  const animationProps = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0 } },
        exit: { opacity: 0, transition: { duration: 0 } },
      }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  const innerAnimationProps = reduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { scale: 0.95 }, animate: { scale: 1 } };

  return (
    <motion.div
      {...animationProps}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl"
    >
      <motion.div
        {...innerAnimationProps}
        className="bg-surface p-6 rounded-xl shadow-xl max-w-sm mx-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-warning/10 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Discard changes?</h3>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          You have unsaved changes. Are you sure you want to discard them?
        </p>
        <div className="flex items-center justify-end gap-3">
          <AppButton variant="outline" onClick={onCancel}>
            Keep editing
          </AppButton>
          <AppButton variant="primary" onClick={onConfirm}>
            Discard
          </AppButton>
        </div>
      </motion.div>
    </motion.div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({
  isOpen,
  title = 'Edit Photo',
  confirmOnClose = true,
  onSave,
  onCancel,
  ...editorProps
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Get animation variants based on reduced motion preference
  const backdropVariants = getBackdropVariants(shouldReduceMotion);
  const modalVariants = getModalVariants(shouldReduceMotion);

  // Track dirty state from editor
  const handleSave = useCallback(
    (file: File, cropData?: CropData) => {
      setIsDirty(false);
      onSave(file, cropData);
    },
    [onSave]
  );

  // Handle cancel with confirmation
  const handleCancel = useCallback(() => {
    if (confirmOnClose && isDirty) {
      setShowConfirm(true);
    } else {
      setIsDirty(false);
      onCancel();
    }
  }, [confirmOnClose, isDirty, onCancel]);

  // Handle confirm discard
  const handleConfirmDiscard = useCallback(() => {
    setShowConfirm(false);
    setIsDirty(false);
    onCancel();
  }, [onCancel]);

  // Handle cancel discard
  const handleCancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Store current active element
      previousActiveElement.current = document.activeElement;

      // Focus the modal
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';

      // Return focus to previous element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        if (showConfirm) {
          handleCancelDiscard();
        } else {
          handleCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showConfirm, handleCancel, handleCancelDiscard]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener('keydown', handleFocusTrap);
    return () => document.removeEventListener('keydown', handleFocusTrap);
  }, [isOpen]);

  // Track dirty state (simplified - in a real app, this would come from the editor)
  useEffect(() => {
    if (isOpen) {
      // Reset dirty state when modal opens
      setIsDirty(false);

      // Set dirty after any interaction (simplified detection)
      const timeout = setTimeout(() => {
        const handleInteraction = () => {
          setIsDirty(true);
          modalRef.current?.removeEventListener('mousedown', handleInteraction);
          modalRef.current?.removeEventListener('touchstart', handleInteraction);
        };

        modalRef.current?.addEventListener('mousedown', handleInteraction);
        modalRef.current?.addEventListener('touchstart', handleInteraction);
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Render nothing if closed
  if (!isOpen) return null;

  // Render modal in portal
  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="modal-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
          onClick={handleBackdropClick}
        >
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal - Compact design inspired by Slack/Discord */}
          <motion.div
            ref={modalRef}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full h-full sm:h-auto sm:max-w-[400px] sm:rounded-2xl
              bg-surface/95 backdrop-blur-xl shadow-2xl
              flex flex-col overflow-hidden
              border border-white/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title"
            tabIndex={-1}
          >
            {/* Compact Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2
                id="avatar-editor-title"
                className="text-base font-semibold text-text-primary"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={handleCancel}
                className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary
                  transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content - Minimal padding for larger preview */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <AvatarEditor
                {...editorProps}
                onSave={handleSave}
                onCancel={handleCancel}
                enableFilters={editorProps.enableFilters !== false}
                enableRotation={editorProps.enableRotation !== false}
                enableFlip={editorProps.enableFlip !== false}
              />
            </div>

            {/* Confirmation Dialog */}
            <AnimatePresence>
              {showConfirm && (
                <ConfirmDialog
                  isOpen={showConfirm}
                  onConfirm={handleConfirmDiscard}
                  onCancel={handleCancelDiscard}
                  reduceMotion={shouldReduceMotion}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

AvatarEditorModal.displayName = 'AvatarEditorModal';

export default AvatarEditorModal;
