import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AppButton } from './AppButton';

/* =============================================================================
   Modal Component

   A fully accessible modal dialog component with support for different sizes,
   animations, and focus management.
   ============================================================================= */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title (for accessibility) */
  title?: string;
  /** Modal description (for accessibility) */
  description?: string;
  /** Size variant */
  size?: ModalSize;
  /** Close on backdrop click */
  closeOnBackdropClick?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
  /** Prevent body scroll when open */
  preventScroll?: boolean;
  /** Center modal vertically */
  centered?: boolean;
  /** Custom z-index */
  zIndex?: number;
  /** Animation variant */
  animation?: 'fade' | 'scale' | 'slide';
  children: React.ReactNode;
  className?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  preventScroll = true,
  centered = true,
  zIndex,
  animation = 'scale',
  children,
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!preventScroll) return;

    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen, preventScroll]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else {
      previousActiveElement.current?.focus();
    }
  }, [isOpen]);

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }, []);

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const animationStyles = {
    fade: 'animate-fade-in',
    scale: 'animate-scale-in',
    slide: 'animate-slide-in-bottom',
  };

  const modal = (
    <div
      className="fixed inset-0"
      style={{ zIndex: zIndex || 'var(--z-modal)' }}
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0
          bg-black/50
          backdrop-blur-sm
          animate-fade-in
        `}
        aria-hidden="true"
        onClick={handleBackdropClick}
      />

      {/* Modal Container */}
      <div
        className={`
          fixed inset-0
          overflow-y-auto
          ${centered ? 'flex items-center justify-center min-h-full' : 'py-8'}
          px-4
        `}
        onClick={handleBackdropClick}
      >
        {/* Modal Content */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={`
            relative
            w-full
            ${sizeStyles[size]}
            bg-surface
            rounded-modal
            shadow-2xl
            ${animationStyles[animation]}
            outline-none
            ${className}
          `}
        >
          {showCloseButton && (
            <AppButton
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 z-10"
              aria-label="Close modal"
            >
              <X size={20} />
            </AppButton>
          )}
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

/* =============================================================================
   Modal.Header Component
   ============================================================================= */

export interface ModalHeaderProps {
  children: React.ReactNode;
  /** Show bottom border */
  bordered?: boolean;
  className?: string;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  children,
  bordered = true,
  className = '',
}) => {
  return (
    <div
      className={`
        px-6 py-4
        ${bordered ? 'border-b border-border' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Modal.Title Component
   ============================================================================= */

export interface ModalTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const ModalTitle: React.FC<ModalTitleProps> = ({
  children,
  className = '',
}) => {
  return (
    <h2
      id="modal-title"
      className={`text-lg font-semibold text-text-primary pr-8 ${className}`}
    >
      {children}
    </h2>
  );
};

/* =============================================================================
   Modal.Description Component
   ============================================================================= */

export interface ModalDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const ModalDescription: React.FC<ModalDescriptionProps> = ({
  children,
  className = '',
}) => {
  return (
    <p
      id="modal-description"
      className={`text-sm text-text-secondary mt-1 ${className}`}
    >
      {children}
    </p>
  );
};

/* =============================================================================
   Modal.Body Component
   ============================================================================= */

export interface ModalBodyProps {
  children: React.ReactNode;
  /** Custom padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const ModalBody: React.FC<ModalBodyProps> = ({
  children,
  padding = 'md',
  className = '',
}) => {
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div className={`${paddingStyles[padding]} ${className}`}>
      {children}
    </div>
  );
};

/* =============================================================================
   Modal.Footer Component
   ============================================================================= */

export interface ModalFooterProps {
  children: React.ReactNode;
  /** Show top border */
  bordered?: boolean;
  /** Content alignment */
  align?: 'left' | 'center' | 'right' | 'between';
  className?: string;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  bordered = true,
  align = 'right',
  className = '',
}) => {
  const alignStyles = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div
      className={`
        px-6 py-4
        flex items-center gap-3
        ${alignStyles[align]}
        ${bordered ? 'border-t border-border bg-background-alt' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Confirmation Dialog Component
   ============================================================================= */

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader bordered={false}>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody padding="sm">
        <p className="text-text-secondary">{message}</p>
      </ModalBody>
      <ModalFooter bordered={false}>
        <AppButton variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </AppButton>
        <AppButton
          variant={variant === 'destructive' ? 'destructive' : 'primary'}
          onClick={onConfirm}
          isLoading={isLoading}
        >
          {confirmText}
        </AppButton>
      </ModalFooter>
    </Modal>
  );
};

/* =============================================================================
   Compound Export
   ============================================================================= */

const ModalCompound = Object.assign(Modal, {
  Header: ModalHeader,
  Title: ModalTitle,
  Description: ModalDescription,
  Body: ModalBody,
  Footer: ModalFooter,
});

export { ModalCompound as Dialog };
export default Modal;
