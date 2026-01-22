/**
 * Design Studio Wrapper with Error Boundary
 *
 * Wraps GalleryDesignStudioPage with error boundary for reliable error handling
 * and recovery in the design studio interface.
 */

import React, { ErrorInfo } from 'react';
import ErrorBoundary from '../../../error/ErrorBoundary';
import GalleryDesignStudioPage from '../../../../pages/workspace/GalleryDesignStudioPage';

const DesignStudioErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <div className="flex items-center justify-center min-h-screen p-8">
    <div className="max-w-md w-full space-y-4 text-center">
      <div className="text-6xl">⚠️</div>
      <h1 className="text-2xl font-bold text-text-primary">Design Studio Error</h1>
      <p className="text-text-secondary">
        Something went wrong while loading the design studio.
      </p>
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 text-left">
          <code className="block break-words">{error.message}</code>
        </div>
      )}
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-accent-primary text-white rounded font-medium hover:opacity-90 transition-opacity"
      >
        Reload Page
      </button>
    </div>
  </div>
);

export const DesignStudioWrapper: React.FC = () => (
  <ErrorBoundary
    fallback={<DesignStudioErrorFallback />}
    onError={(error: Error, info: ErrorInfo) => {
      console.error('Design Studio Error:', error, info);
      // Could send to error tracking service here
    }}
  >
    <GalleryDesignStudioPage />
  </ErrorBoundary>
);

export default DesignStudioWrapper;
