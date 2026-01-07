/**
 * InvitationErrorFallback: User-friendly error display for invitation features
 *
 * Provides contextual error messages and recovery actions for:
 * - Failed data fetches
 * - React component errors
 * - Network errors
 *
 * Feature: 016-save-the-date
 * Task: T127
 */

import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Home,
  WifiOff,
  Lock,
  FileX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ErrorType =
  | 'network'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'expired'
  | 'generic';

interface InvitationErrorFallbackProps {
  /** Type of error to display */
  type?: ErrorType;
  /** Custom error title */
  title?: string;
  /** Custom error message */
  message?: string;
  /** Show retry button */
  showRetry?: boolean;
  /** Whether a retry is currently in progress */
  isRetrying?: boolean;
  /** Retry callback */
  onRetry?: () => void;
  /** Show back button */
  showBack?: boolean;
  /** Show home button */
  showHome?: boolean;
  /** Additional class name */
  className?: string;
}

// ---------------------------------------------------------------------------
// Error Config
// ---------------------------------------------------------------------------

const ERROR_CONFIG: Record<
  ErrorType,
  {
    icon: React.ElementType;
    title: string;
    message: string;
    iconColor: string;
    bgColor: string;
  }
> = {
  network: {
    icon: WifiOff,
    title: 'Connection Problem',
    message:
      'Unable to connect to the server. Please check your internet connection and try again.',
    iconColor: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  not_found: {
    icon: FileX,
    title: 'Invitation Not Found',
    message:
      "The invitation you're looking for doesn't exist or may have been deleted.",
    iconColor: 'text-text-secondary',
    bgColor: 'bg-surface-hover',
  },
  unauthorized: {
    icon: Lock,
    title: 'Access Required',
    message: 'Please log in to view this invitation.',
    iconColor: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  forbidden: {
    icon: Lock,
    title: 'Access Denied',
    message: "You don't have permission to view this invitation.",
    iconColor: 'text-error',
    bgColor: 'bg-error/10',
  },
  expired: {
    icon: AlertTriangle,
    title: 'Invitation Expired',
    message: 'This invitation has expired or is no longer available.',
    iconColor: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  generic: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    iconColor: 'text-error',
    bgColor: 'bg-error/10',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const InvitationErrorFallback: React.FC<InvitationErrorFallbackProps> = ({
  type = 'generic',
  title,
  message,
  showRetry = true,
  isRetrying = false,
  onRetry,
  showBack = true,
  showHome = true,
  className = '',
}) => {
  const navigate = useNavigate();

  const config = ERROR_CONFIG[type];
  const Icon = config.icon;
  const displayTitle = title || config.title;
  const displayMessage = message || config.message;

  return (
    <div
      className={`flex items-center justify-center min-h-[400px] p-6 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <AppCard className="max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div
          className={`w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center mx-auto mb-6`}
        >
          <Icon className={`w-8 h-8 ${config.iconColor}`} aria-hidden="true" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {displayTitle}
        </h2>

        {/* Message */}
        <p className="text-text-secondary mb-6">{displayMessage}</p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {showRetry && onRetry && (
            <AppButton
              variant="primary"
              onClick={onRetry}
              isLoading={isRetrying}
              loadingText="Retrying..."
            >
              <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Try Again
            </AppButton>
          )}

          {showBack && (
            <AppButton variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Go Back
            </AppButton>
          )}

          {showHome && (
            <AppButton variant="ghost" onClick={() => navigate('/dashboard')}>
              <Home className="w-4 h-4 mr-2" aria-hidden="true" />
              Dashboard
            </AppButton>
          )}
        </div>
      </AppCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper: Map HTTP status to error type
// ---------------------------------------------------------------------------

export function getErrorTypeFromStatus(status: number): ErrorType {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 410:
      return 'expired';
    default:
      if (status >= 500) return 'network';
      return 'generic';
  }
}

// ---------------------------------------------------------------------------
// Helper: Map Error to error type
// ---------------------------------------------------------------------------

export function getErrorTypeFromError(error: unknown): ErrorType {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'network';
  }

  if (error && typeof error === 'object' && 'status' in error) {
    return getErrorTypeFromStatus((error as { status: number }).status);
  }

  return 'generic';
}

// ---------------------------------------------------------------------------
// Inline Error Component (for smaller spaces)
// ---------------------------------------------------------------------------

export const InlineError: React.FC<{
  message?: string;
  onRetry?: () => void;
  className?: string;
}> = ({ message = 'Failed to load data', onRetry, className = '' }) => (
  <div
    className={`flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-lg ${className}`}
    role="alert"
  >
    <AlertTriangle className="w-5 h-5 text-error flex-shrink-0" aria-hidden="true" />
    <p className="text-sm text-text-primary flex-1">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
      >
        Retry
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

InvitationErrorFallback.displayName = 'InvitationErrorFallback';
InlineError.displayName = 'InlineError';

export default InvitationErrorFallback;
