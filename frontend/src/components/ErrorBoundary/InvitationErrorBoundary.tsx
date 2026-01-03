/**
 * InvitationErrorBoundary: Specialized error boundary for invitation dashboard
 *
 * Features:
 * - Catches React errors within the dashboard
 * - Provides retry functionality with exponential backoff
 * - Themed UI matching design system (light/dark mode)
 * - Accessible error states with ARIA attributes
 *
 * Feature: 020-invitation-rsvp-hardening
 * Tasks: T042 (Create), T043 (Wrap dashboard)
 */

import { Component, ErrorInfo, ReactNode, useCallback, useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationErrorBoundaryProps {
  children: ReactNode;
  /** Optional callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional custom fallback render */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
  /** Maximum retry attempts before showing permanent error */
  maxRetries?: number;
}

interface InvitationErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
  isRetrying: boolean;
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo?: ErrorInfo;
  resetError: () => void;
  retryWithBackoff: () => void;
  retryCount: number;
  maxRetries: number;
  isRetrying: boolean;
}

// ---------------------------------------------------------------------------
// Default Error Fallback Component
// ---------------------------------------------------------------------------

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  retryWithBackoff,
  retryCount,
  maxRetries,
  isRetrying,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const canRetry = retryCount < maxRetries;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center min-h-[300px] p-6 bg-surface rounded-lg border border-border"
    >
      {/* Error Icon */}
      <div className="mb-4 p-3 rounded-full bg-error/10 text-error">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>

      {/* Error Message */}
      <h2 className="text-xl font-semibold text-text-primary mb-2">
        Something went wrong
      </h2>
      <p className="text-text-secondary text-center mb-6 max-w-md">
        {canRetry
          ? 'We encountered an error loading the dashboard. Click retry to try again.'
          : 'We were unable to load the dashboard after multiple attempts. Please refresh the page or contact support.'}
      </p>

      {/* Retry count indicator */}
      {retryCount > 0 && (
        <p className="text-sm text-text-tertiary mb-4">
          Retry attempts: {retryCount} / {maxRetries}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        {canRetry ? (
          <AppButton
            variant="primary"
            onClick={retryWithBackoff}
            disabled={isRetrying}
            className="min-w-[120px]"
          >
            {isRetrying ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Retry
              </>
            )}
          </AppButton>
        ) : (
          <AppButton
            variant="primary"
            onClick={() => window.location.reload()}
            className="min-w-[120px]"
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Refresh Page
          </AppButton>
        )}
        <AppButton
          variant="outline"
          onClick={resetError}
          disabled={isRetrying}
        >
          Dismiss
        </AppButton>
      </div>

      {/* Error Details Toggle (for development) */}
      {import.meta.env.DEV && (
        <div className="w-full max-w-md">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            aria-expanded={showDetails}
            aria-controls="error-details"
          >
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {showDetails ? 'Hide' : 'Show'} error details
          </button>

          {showDetails && (
            <div
              id="error-details"
              className="mt-2 p-3 bg-surface-hover rounded text-xs font-mono text-error overflow-auto max-h-[200px]"
            >
              <p className="font-semibold">{error.name}: {error.message}</p>
              {error.stack && (
                <pre className="mt-2 whitespace-pre-wrap text-text-tertiary">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// InvitationErrorBoundary Class Component
// ---------------------------------------------------------------------------

class InvitationErrorBoundary extends Component<
  InvitationErrorBoundaryProps,
  InvitationErrorBoundaryState
> {
  private retryTimeouts: ReturnType<typeof setTimeout>[] = [];

  static defaultProps = {
    maxRetries: 3,
  };

  constructor(props: InvitationErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<InvitationErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for monitoring (SOC 2 compliance - no PII in logs)
    console.error('InvitationErrorBoundary caught error:', {
      errorName: error.name,
      errorMessage: error.message,
      componentStack: errorInfo.componentStack,
    });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  componentWillUnmount(): void {
    // Clean up any pending retry timeouts
    this.retryTimeouts.forEach(clearTimeout);
  }

  /**
   * Reset error state and allow re-render
   */
  resetError = (): void => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      isRetrying: false,
    });
  };

  /**
   * Retry with exponential backoff
   * Delay increases: 1s, 2s, 4s, etc.
   */
  retryWithBackoff = (): void => {
    const { retryCount } = this.state;
    const { maxRetries = 3 } = this.props;

    if (retryCount >= maxRetries) {
      return;
    }

    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s...
    this.setState({ isRetrying: true });

    const timeout = setTimeout(() => {
      this.setState((prevState) => ({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: prevState.retryCount + 1,
        isRetrying: false,
      }));
    }, delay);

    this.retryTimeouts.push(timeout);
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, retryCount, isRetrying } = this.state;
    const { children, fallback, maxRetries = 3 } = this.props;

    if (hasError && error) {
      const fallbackProps: ErrorFallbackProps = {
        error,
        errorInfo,
        resetError: this.resetError,
        retryWithBackoff: this.retryWithBackoff,
        retryCount,
        maxRetries,
        isRetrying,
      };

      if (fallback) {
        return fallback(fallbackProps);
      }

      return <DefaultErrorFallback {...fallbackProps} />;
    }

    return children;
  }
}

// ---------------------------------------------------------------------------
// Custom Hook for Error Recovery
// ---------------------------------------------------------------------------

/**
 * Hook to manually trigger error recovery with backoff
 * Use this when you need programmatic control over error handling
 */
export function useErrorRecovery(maxRetries = 3) {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = useCallback((onRetry: () => void) => {
    if (retryCount >= maxRetries) return;

    const delay = Math.pow(2, retryCount) * 1000;
    setIsRetrying(true);

    setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setIsRetrying(false);
      onRetry();
    }, delay);
  }, [retryCount, maxRetries]);

  const reset = useCallback(() => {
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  return {
    retryCount,
    isRetrying,
    canRetry: retryCount < maxRetries,
    retry,
    reset,
  };
}

export default InvitationErrorBoundary;
