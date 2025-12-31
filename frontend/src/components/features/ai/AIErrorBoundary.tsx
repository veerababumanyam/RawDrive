/**
 * AI Error Boundary Component
 *
 * Specialized error boundary for AI features with retry functionality.
 * Feature: 010-ai-powered-features
 * Task: T073 - Implement comprehensive error boundaries for AI features
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';

interface AIErrorBoundaryProps {
  children: ReactNode;
  featureName?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  fallback?: ReactNode;
}

interface AIErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error messages for common AI errors
 */
const AI_ERROR_MESSAGES: Record<string, string> = {
  NetworkError: 'Unable to connect to the AI service. Please check your internet connection.',
  TimeoutError: 'The AI request timed out. Please try again.',
  RateLimitError: 'Too many requests. Please wait a moment and try again.',
  APIKeyError: 'AI features are not configured. Please check your Gemini API settings.',
  QuotaExceeded: 'AI usage limit reached. Please try again later or upgrade your plan.',
  InvalidResponse: 'Received an unexpected response from the AI. Please try again.',
  Default: 'An error occurred while processing your request. Please try again.',
};

/**
 * Get user-friendly error message based on error type
 */
function getErrorMessage(error?: Error): string {
  if (!error) return AI_ERROR_MESSAGES.Default;

  const errorName = error.name || error.constructor.name;
  const errorMessage = error.message?.toLowerCase() || '';

  // Check for network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return AI_ERROR_MESSAGES.NetworkError;
  }

  // Check for timeout
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return AI_ERROR_MESSAGES.TimeoutError;
  }

  // Check for rate limiting
  if (errorMessage.includes('rate') || errorMessage.includes('429')) {
    return AI_ERROR_MESSAGES.RateLimitError;
  }

  // Check for API key issues
  if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
    return AI_ERROR_MESSAGES.APIKeyError;
  }

  // Check for quota
  if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
    return AI_ERROR_MESSAGES.QuotaExceeded;
  }

  return AI_ERROR_MESSAGES[errorName] || AI_ERROR_MESSAGES.Default;
}

export class AIErrorBoundary extends Component<AIErrorBoundaryProps, AIErrorBoundaryState> {
  constructor(props: AIErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): AIErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error for debugging
    console.error(`[AI Error Boundary] ${this.props.featureName || 'AI Feature'} error:`, error);
    console.error('Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onRetry?.();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onDismiss?.();
  };

  render() {
    if (this.state.hasError) {
      // If custom fallback provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = getErrorMessage(this.state.error);
      const featureName = this.props.featureName || 'AI Feature';

      return (
        <AppCard className="p-6 bg-surface border-error/20">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2 bg-error/10 rounded-full">
              <AlertTriangle className="w-6 h-6 text-error" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {featureName} Error
              </h3>
              <p className="text-text-secondary mb-4">{errorMessage}</p>
              <div className="flex items-center gap-3">
                <AppButton
                  variant="primary"
                  size="sm"
                  onClick={this.handleRetry}
                  aria-label={`Retry ${featureName}`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Try Again
                </AppButton>
                {this.props.onDismiss && (
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onClick={this.handleDismiss}
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4 mr-2" aria-hidden="true" />
                    Dismiss
                  </AppButton>
                )}
              </div>
            </div>
          </div>
        </AppCard>
      );
    }

    return this.props.children;
  }
}

export default AIErrorBoundary;
