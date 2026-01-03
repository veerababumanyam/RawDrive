import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  isChunkLoadError?: boolean;
}

/**
 * Check if an error is a chunk load error (from stale cache after deployment)
 */
const isChunkLoadError = (error: Error): boolean => {
  const message = error?.message?.toLowerCase() || '';
  const name = error?.name?.toLowerCase() || '';
  
  // Check for various chunk load error patterns
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk') ||
    message.includes('dynamically imported module') ||
    name === 'chunkloaderror' ||
    (error as any)?.code === 'CSS_CHUNK_LOAD_FAILED'
  );
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const chunkError = isChunkLoadError(error);
    return { hasError: true, error, isChunkLoadError: chunkError };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Don't log chunk load errors as they're expected after deployments
    if (!isChunkLoadError(error)) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);
  }

  handleRefresh = () => {
    // Force a hard refresh to get new assets
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Show specific UI for chunk load errors (stale cache)
      if (this.state.isChunkLoadError) {
        return (
          <div className="error-boundary-fallback" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            padding: '24px',
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: '16px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9z"/>
                <path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
              New Version Available
            </h2>
            <p style={{ margin: '0 0 16px', color: '#666', maxWidth: '300px' }}>
              The app has been updated. Please refresh to get the latest version.
            </p>
            <button
              onClick={this.handleRefresh}
              style={{
                padding: '10px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Refresh Page
            </button>
          </div>
        );
      }

      // Default fallback for other errors
      return this.props.fallback || (
        <div className="error-boundary-fallback">
          <h2>Something went wrong</h2>
          <p>Please try refreshing the page</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;