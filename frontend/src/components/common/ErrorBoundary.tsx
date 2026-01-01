/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays
 * a fallback UI. Provides error reporting and recovery options.
 *
 * Feature: 016-save-the-date Phase 13
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  title?: string;
  resetKeys?: any[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showErrorDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showErrorDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state if resetKeys changed
    if (this.props.resetKeys && prevProps.resetKeys) {
      const keysChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (keysChanged && this.state.hasError) {
        this.resetError();
      }
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showErrorDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showErrorDetails: !prev.showErrorDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6">
          <AppCard className="max-w-lg w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-error" />
              </div>

              <h2 className="text-xl font-semibold text-text-primary mb-2">
                {this.props.title || 'Something went wrong'}
              </h2>

              <p className="text-text-secondary mb-6">
                We encountered an unexpected error. Please try again or return to the home page.
              </p>

              <div className="flex justify-center gap-3 mb-4">
                <AppButton
                  variant="primary"
                  onClick={this.resetError}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Try Again
                </AppButton>
                <AppButton
                  variant="outline"
                  onClick={() => (window.location.href = '/')}
                  leftIcon={<Home className="w-4 h-4" />}
                >
                  Go Home
                </AppButton>
              </div>

              {/* Error details toggle */}
              {(this.props.showDetails || import.meta.env.DEV) && (
                <div className="mt-4">
                  <button
                    onClick={this.toggleDetails}
                    className="text-sm text-text-tertiary hover:text-text-secondary flex items-center gap-1 mx-auto"
                  >
                    {this.state.showErrorDetails ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show details
                      </>
                    )}
                  </button>

                  {this.state.showErrorDetails && (
                    <div className="mt-4 p-4 bg-surface-alt rounded-lg text-left">
                      <p className="text-sm font-mono text-error mb-2">
                        {this.state.error?.message}
                      </p>
                      {this.state.errorInfo && (
                        <pre className="text-xs text-text-tertiary overflow-auto max-h-40">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </AppCard>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a component with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

/**
 * Smaller inline error fallback for non-critical components
 */
export const InlineErrorFallback: React.FC<{
  error?: Error;
  onRetry?: () => void;
  message?: string;
}> = ({ error, onRetry, message }) => (
  <div className="p-4 bg-error/5 border border-error/20 rounded-lg">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-error font-medium">
          {message || 'Failed to load this content'}
        </p>
        {error && import.meta.env.DEV && (
          <p className="text-xs text-error/70 mt-1 font-mono">{error.message}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm text-primary hover:underline mt-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  </div>
);

export default ErrorBoundary;
