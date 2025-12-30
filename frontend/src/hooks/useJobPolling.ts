/**
 * useJobPolling Hook
 * Feature: 010-ai-powered-features
 *
 * Reusable hook for polling async job status with configurable options.
 * Used by StoryGenerator, SmartCurationPanel, and other AI features.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default polling interval in milliseconds */
export const DEFAULT_POLL_INTERVAL_MS = 2000;

/** Default maximum polling attempts before timeout */
export const DEFAULT_MAX_ATTEMPTS = 30;

/** Default timeout in milliseconds (DEFAULT_POLL_INTERVAL_MS * DEFAULT_MAX_ATTEMPTS) */
export const DEFAULT_TIMEOUT_MS = DEFAULT_POLL_INTERVAL_MS * DEFAULT_MAX_ATTEMPTS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'idle' | 'pending' | 'polling' | 'completed' | 'failed' | 'timeout';

export interface JobPollingOptions<TResult> {
  /** Function to fetch job status, returns { status, result?, message? } */
  fetchStatus: () => Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: TResult;
    message?: string;
  }>;
  /** Called when job completes successfully */
  onComplete?: (result: TResult) => void;
  /** Called when job fails */
  onError?: (error: string) => void;
  /** Called on timeout */
  onTimeout?: () => void;
  /** Polling interval in milliseconds */
  pollInterval?: number;
  /** Maximum polling attempts */
  maxAttempts?: number;
}

export interface UseJobPollingReturn<TResult> {
  /** Current job status */
  status: JobStatus;
  /** Result when completed */
  result: TResult | null;
  /** Error message if failed */
  error: string | null;
  /** Start polling */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
  /** Reset state */
  reset: () => void;
  /** Whether currently polling */
  isPolling: boolean;
  /** Current attempt number */
  attempt: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useJobPolling<TResult>(
  options: JobPollingOptions<TResult>
): UseJobPollingReturn<TResult> {
  const {
    fetchStatus,
    onComplete,
    onError,
    onTimeout,
    pollInterval = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;

  const [status, setStatus] = useState<JobStatus>('idle');
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const pollingRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setResult(null);
    setError(null);
    setAttempt(0);
  }, [stopPolling]);

  const poll = useCallback(async () => {
    if (!pollingRef.current) return;

    setAttempt((prev) => {
      const newAttempt = prev + 1;

      if (newAttempt > maxAttempts) {
        pollingRef.current = false;
        setStatus('timeout');
        setError('Operation timed out. Please try again.');
        onTimeout?.();
        return prev;
      }

      return newAttempt;
    });

    try {
      const response = await fetchStatus();

      if (!pollingRef.current) return;

      if (response.status === 'completed' && response.result) {
        pollingRef.current = false;
        setStatus('completed');
        setResult(response.result);
        onComplete?.(response.result);
      } else if (response.status === 'failed') {
        pollingRef.current = false;
        setStatus('failed');
        const errorMsg = response.message || 'Operation failed';
        setError(errorMsg);
        onError?.(errorMsg);
      } else {
        // Still pending or processing, continue polling
        timeoutRef.current = setTimeout(poll, pollInterval);
      }
    } catch (err) {
      if (!pollingRef.current) return;

      pollingRef.current = false;
      setStatus('failed');
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [fetchStatus, maxAttempts, pollInterval, onComplete, onError, onTimeout]);

  const startPolling = useCallback(() => {
    // Reset state
    setStatus('polling');
    setResult(null);
    setError(null);
    setAttempt(0);

    // Start polling
    pollingRef.current = true;

    // Initial delay before first poll
    timeoutRef.current = setTimeout(poll, pollInterval);
  }, [poll, pollInterval]);

  return {
    status,
    result,
    error,
    startPolling,
    stopPolling,
    reset,
    isPolling: status === 'polling',
    attempt,
  };
}

export default useJobPolling;
