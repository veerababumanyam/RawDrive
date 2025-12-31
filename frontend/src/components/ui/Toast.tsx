import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

/* =============================================================================
   Toast Component & System

   A complete toast notification system with support for multiple variants,
   auto-dismiss, custom actions, and stacking.
   ============================================================================= */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'default';
export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export interface ToastData {
  id: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => string;
  removeToast: (id: string) => void;
  removeAllToasts: () => void;
  /** Convenience method: showToast(message, variant) for quick toasts */
  showToast: (message: string, variant?: ToastVariant) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/* =============================================================================
   Toast Provider Component
   ============================================================================= */

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Position of toast container */
  position?: ToastPosition;
  /** Max number of toasts visible at once */
  maxToasts?: number;
  /** Default duration in ms (0 for no auto-dismiss) */
  defaultDuration?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
  maxToasts = 5,
  defaultDuration = 5000,
}) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback(
    (toast: Omit<ToastData, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastData = {
        id,
        variant: 'default',
        duration: defaultDuration,
        dismissible: true,
        ...toast,
      };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        // Keep only maxToasts
        return updated.slice(-maxToasts);
      });

      // Auto-dismiss
      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, newToast.duration);
      }

      return id;
    },
    [defaultDuration, maxToasts]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const removeAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience method for quick toasts: showToast(message, variant)
  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'default') => {
      return addToast({ message, variant });
    },
    [addToast]
  );

  const positionStyles: Record<ToastPosition, string> = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  const isBottom = position.startsWith('bottom');

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, removeAllToasts, showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`
              fixed z-toast
              ${positionStyles[position]}
              flex flex-col gap-3
              ${isBottom ? 'flex-col-reverse' : ''}
              pointer-events-none
            `}
            role="region"
            aria-label="Notifications"
          >
            {toasts.map((toast) => (
              <Toast key={toast.id} {...toast} onDismiss={() => removeToast(toast.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

/* =============================================================================
   Individual Toast Component
   ============================================================================= */

interface ToastProps extends ToastData {
  onDismiss: () => void;
}

const variantConfig: Record<
  ToastVariant,
  { icon: React.ReactNode; bgClass: string; borderClass: string; iconClass: string }
> = {
  success: {
    icon: <CheckCircle size={20} />,
    bgClass: 'bg-success-50 dark:bg-success-600/10',
    borderClass: 'border-success-200 dark:border-success-600/30',
    iconClass: 'text-success',
  },
  error: {
    icon: <AlertCircle size={20} />,
    bgClass: 'bg-error-50 dark:bg-error-600/10',
    borderClass: 'border-error-200 dark:border-error-600/30',
    iconClass: 'text-error',
  },
  warning: {
    icon: <AlertTriangle size={20} />,
    bgClass: 'bg-warning-50 dark:bg-warning-600/10',
    borderClass: 'border-warning-200 dark:border-warning-600/30',
    iconClass: 'text-warning',
  },
  info: {
    icon: <Info size={20} />,
    bgClass: 'bg-info-50 dark:bg-info-600/10',
    borderClass: 'border-info-200 dark:border-info-600/30',
    iconClass: 'text-info',
  },
  default: {
    icon: null,
    bgClass: 'bg-surface',
    borderClass: 'border-border',
    iconClass: '',
  },
};

const Toast: React.FC<ToastProps> = ({
  title,
  message,
  variant = 'default',
  dismissible = true,
  action,
  onDismiss,
}) => {
  const config = variantConfig[variant];

  return (
    <div
      className={`
        pointer-events-auto
        w-80 max-w-[calc(100vw-2rem)]
        ${config.bgClass}
        border ${config.borderClass}
        rounded-lg
        shadow-lg
        animate-slide-in-right
        overflow-hidden
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {config.icon && (
            <span className={`flex-shrink-0 ${config.iconClass}`} aria-hidden="true">
              {config.icon}
            </span>
          )}
          <div className="flex-1 min-w-0">
            {title && (
              <p className="text-sm font-semibold text-text-primary">{title}</p>
            )}
            <p className={`text-sm text-text-secondary ${title ? 'mt-1' : ''}`}>
              {message}
            </p>
            {action && (
              <button
                onClick={() => {
                  action.onClick();
                  onDismiss();
                }}
                className="mt-2 text-sm font-medium text-primary hover:text-primary-hover transition-colors"
              >
                {action.label}
              </button>
            )}
          </div>
          {dismissible && (
            <button
              onClick={onDismiss}
              className="
                flex-shrink-0
                p-1
                rounded
                text-text-tertiary
                hover:text-text-primary hover:bg-surface-hover
                transition-colors
                focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
              "
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   Convenience Hook for Quick Toasts
   ============================================================================= */

export const useToastActions = () => {
  const { addToast, removeToast, removeAllToasts } = useToast();

  return {
    success: (message: string, options?: Partial<ToastData>) =>
      addToast({ message, variant: 'success', ...options }),
    error: (message: string, options?: Partial<ToastData>) =>
      addToast({ message, variant: 'error', ...options }),
    warning: (message: string, options?: Partial<ToastData>) =>
      addToast({ message, variant: 'warning', ...options }),
    info: (message: string, options?: Partial<ToastData>) =>
      addToast({ message, variant: 'info', ...options }),
    custom: addToast,
    dismiss: removeToast,
    dismissAll: removeAllToasts,
  };
};

export default Toast;
