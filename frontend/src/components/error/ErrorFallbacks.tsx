import React from 'react';

interface AppErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export const AppErrorFallback: React.FC<AppErrorFallbackProps> = ({ resetError }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
      <div className="mb-4">
        <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">
        Something went wrong
      </h1>
      <p className="text-gray-600 mb-6">
        We encountered an unexpected error. Please try refreshing the page.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Refresh Page
        </button>
        {resetError && (
          <button
            onClick={resetError}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  </div>
);

interface RouteErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export const RouteErrorFallback: React.FC<RouteErrorFallbackProps> = ({ resetError }) => (
  <div className="flex items-center justify-center min-h-[400px] bg-gray-50">
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
      <div className="mb-4">
        <svg className="mx-auto h-10 w-10 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Page Error
      </h2>
      <p className="text-gray-600 mb-4">
        This page encountered an error. You can try going back or refreshing.
      </p>
      <div className="space-y-2">
        <button
          onClick={() => window.history.back()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Go Back
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Refresh Page
        </button>
        {resetError && (
          <button
            onClick={resetError}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  </div>
);

interface ComponentErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export const ComponentErrorFallback: React.FC<ComponentErrorFallbackProps> = ({ resetError }) => (
  <div className="bg-red-50 border border-red-200 rounded-md p-4 my-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="ml-3 flex-1">
        <h3 className="text-sm font-medium text-red-800">
          Component Error
        </h3>
        <p className="text-sm text-red-700 mt-1">
          This component encountered an error. The rest of the page should still work.
        </p>
        {resetError && (
          <button
            onClick={resetError}
            className="mt-2 text-sm bg-red-100 text-red-800 px-3 py-1 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  </div>
);