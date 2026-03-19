/**
 * FaceErrorBoundary
 * Error boundary for face recognition operations.
 * Prevents face-related failures from crashing the entire page.
 */

import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FaceErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  context?: string;
}

interface FaceErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class FaceErrorBoundary extends Component<FaceErrorBoundaryProps, FaceErrorBoundaryState> {
  constructor(props: FaceErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): FaceErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const context = this.props.context || 'FaceErrorBoundary';
    console.error(`[${context}] Face operation error:`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center py-12 px-4 text-center"
          role="alert"
        >
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-warning" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            Something went wrong with face recognition
          </h3>
          <p className="text-sm text-text-secondary mb-4 max-w-md">
            An error occurred while processing face data. Please try refreshing.
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default FaceErrorBoundary;
