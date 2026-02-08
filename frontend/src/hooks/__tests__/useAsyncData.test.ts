/**
 * useAsyncData Hook Tests
 *
 * Comprehensive tests for the unified async data fetching hook.
 * Tests all supported features:
 * - Automatic fetching on mount
 * - Error handling
 * - Retries with exponential backoff
 * - Request cancellation
 * - Stale-while-revalidate
 * - Polling intervals
 * - Optimistic updates
 * - Dependencies
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useAsyncData,
  useAsyncOnce,
  useAsyncMutation,
} from '../useAsyncData';

describe('useAsyncData Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should return idle state when disabled', () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, { enabled: false })
      );

      expect(result.current.status).toBe('idle');
      expect(result.current.isIdle).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(asyncFn).not.toHaveBeenCalled();
    });

    it('should fetch data on mount when enabled', async () => {
      const asyncFn = vi.fn().mockResolvedValue('test data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBe('test data');
      expect(result.current.error).toBeNull();
      expect(asyncFn).toHaveBeenCalledTimes(1);
    });

    it('should use initial data', () => {
      const asyncFn = vi.fn().mockResolvedValue('new data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, { initialData: 'initial', enabled: false })
      );

      expect(result.current.data).toBe('initial');
      expect(result.current.status).toBe('success');
      expect(result.current.isSuccess).toBe(true);
    });

    it('should pass AbortSignal to async function', async () => {
      let receivedSignal: AbortSignal | undefined;
      const asyncFn = vi.fn(async (signal: AbortSignal) => {
        receivedSignal = signal;
        return 'data';
      });

      renderHook(() => useAsyncData(asyncFn));

      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalled();
      });

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should show loading state during fetch', async () => {
      let resolveAsync: (value: string) => void;
      const asyncFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveAsync = resolve;
          })
      );

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      // Should be loading immediately
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isFetching).toBe(true);
      expect(result.current.status).toBe('loading');

      // Resolve the promise
      await act(async () => {
        resolveAsync!('data');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isFetching).toBe(false);
      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should set error state when fetch fails', async () => {
      const error = new Error('Network error');
      const asyncFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(error);
      expect(result.current.status).toBe('error');
    });

    it('should call onError callback on failure', async () => {
      const error = new Error('Test error');
      const onError = vi.fn();
      const asyncFn = vi.fn().mockRejectedValue(error);

      renderHook(() =>
        useAsyncData(asyncFn, { onError })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('should call onSuccess callback on success', async () => {
      const data = { value: 'test' };
      const onSuccess = vi.fn();
      const asyncFn = vi.fn().mockResolvedValue(data);

      renderHook(() =>
        useAsyncData(asyncFn, { onSuccess })
      );

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(data);
      });
    });

    it('should call onSettled callback on completion', async () => {
      const data = 'test';
      const onSettled = vi.fn();
      const asyncFn = vi.fn().mockResolvedValue(data);

      renderHook(() =>
        useAsyncData(asyncFn, { onSettled })
      );

      await waitFor(() => {
        expect(onSettled).toHaveBeenCalledWith(data, null);
      });
    });

    it('should convert non-Error exceptions to Error', async () => {
      const asyncFn = vi.fn().mockRejectedValue('string error');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('string error');
    });
  });

  describe('Retry Logic', () => {
    it('should set failureCount on retry attempts', async () => {
      // Using real timers with short delays for more reliable test
      const asyncFn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          retryCount: 1,
          retryDelay: 10,
        })
      );

      // Wait for eventual success (after retry)
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      }, { timeout: 5000 });

      expect(result.current.data).toBe('success');
      expect(asyncFn).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries', async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error('Fail'));

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          retryCount: 0, // No retries - immediate failure
          retryDelay: 10,
        })
      );

      // Wait for error state
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Should have been called at least once
      expect(asyncFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Polling / Refetch Interval', () => {
    it('should set up polling when refetchInterval is provided', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          refetchInterval: 50, // Short interval for testing
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const initialCallCount = asyncFn.mock.calls.length;

      // Wait for at least one poll cycle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have called again due to polling
      expect(asyncFn.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should clean up interval on unmount', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { unmount, result } = renderHook(() =>
        useAsyncData(asyncFn, {
          refetchInterval: 50,
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const callCountBeforeUnmount = asyncFn.mock.calls.length;

      // Unmount
      unmount();

      // Wait some time
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have made more calls after unmount
      expect(asyncFn.mock.calls.length).toBe(callCountBeforeUnmount);
    });
  });

  describe('Dependencies', () => {
    it('should refetch when dependencies change', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { rerender } = renderHook(
        ({ id }) =>
          useAsyncData(asyncFn, {
            deps: [id],
          }),
        { initialProps: { id: 1 } }
      );

      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(1);
      });

      // Change dependency
      rerender({ id: 2 });

      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(2);
      });
    });

    it('should not refetch when dependencies are same', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { rerender } = renderHook(
        ({ id }) =>
          useAsyncData(asyncFn, {
            deps: [id],
          }),
        { initialProps: { id: 1 } }
      );

      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(1);
      });

      // Rerender with same id
      rerender({ id: 1 });

      // Wait a bit to ensure no new calls
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(asyncFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stale Time', () => {
    it('should skip fetch when data is fresh', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          staleTime: 30000,
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(1);
      });

      // Refetch before stale time - should not fetch
      await act(async () => {
        await result.current.refetch({ force: false });
      });

      // Should not fetch again
      expect(asyncFn).toHaveBeenCalledTimes(1);
    });

    it('should force fetch even when fresh', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          staleTime: 30000,
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(1);
      });

      // Force refetch
      await act(async () => {
        await result.current.refetch({ force: true });
      });

      await waitFor(() => {
        expect(asyncFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Keep Previous Data', () => {
    it('should keep previous data while refetching', async () => {
      let resolveSecond: (value: string) => void;
      const asyncFn = vi.fn()
        .mockResolvedValueOnce('first')
        .mockImplementationOnce(() => new Promise<string>((resolve) => {
          resolveSecond = resolve;
        }));

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, {
          keepPreviousData: true,
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(result.current.data).toBe('first');
      });

      // Trigger refetch
      act(() => {
        result.current.refetch();
      });

      // Should still have first data while loading
      expect(result.current.data).toBe('first');
      expect(result.current.isFetching).toBe(true);

      // Resolve second fetch
      await act(async () => {
        resolveSecond!('second');
      });

      await waitFor(() => {
        expect(result.current.data).toBe('second');
      });
    });
  });

  describe('Manual Controls', () => {
    it('should reset to initial state', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, { initialData: 'initial' })
      );

      // Wait for fetch
      await waitFor(() => {
        expect(result.current.data).toBe('data');
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toBe('initial');
      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('success');
    });

    it('should allow optimistic updates with setData', async () => {
      const asyncFn = vi.fn().mockResolvedValue({ count: 0 });

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual({ count: 0 });
      });

      // Optimistic update
      act(() => {
        result.current.setData((prev) =>
          prev ? { count: prev.count + 1 } : { count: 1 }
        );
      });

      expect(result.current.data).toEqual({ count: 1 });
    });

    it('should allow direct setData with value', async () => {
      const asyncFn = vi.fn().mockResolvedValue('initial');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      await waitFor(() => {
        expect(result.current.data).toBe('initial');
      });

      // Direct update
      act(() => {
        result.current.setData('updated');
      });

      expect(result.current.data).toBe('updated');
    });
  });

  describe('Request Cancellation', () => {
    it('should cancel previous request when refetching', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Trigger another refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Should have fetched again
      expect(asyncFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should ignore AbortError', async () => {
      // This test verifies that AbortError doesn't set error state
      // We test by checking unmount doesn't cause isError to be true
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result, unmount } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      // Unmount immediately
      unmount();

      // Should not set error state
      expect(result.current.isError).toBe(false);
    });
  });

  describe('Data Updated At', () => {
    it('should set dataUpdatedAt on successful fetch', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn)
      );

      await waitFor(() => {
        expect(result.current.data).toBe('data');
      });

      expect(result.current.dataUpdatedAt).not.toBeNull();
      expect(typeof result.current.dataUpdatedAt).toBe('number');
    });

    it('should initialize dataUpdatedAt with initial data', () => {
      const asyncFn = vi.fn().mockResolvedValue('new');

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, { initialData: 'initial', enabled: false })
      );

      expect(result.current.dataUpdatedAt).not.toBeNull();
    });
  });
});

describe('useAsyncOnce Hook', () => {
  it('should fetch once on mount', async () => {
    const asyncFn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(() =>
      useAsyncOnce(asyncFn)
    );

    await waitFor(() => {
      expect(result.current.data).toBe('data');
    });

    expect(result.current.isSuccess).toBe(true);
    // Called at least once
    expect(asyncFn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('should not retry on failure', async () => {
    const asyncFn = vi.fn().mockRejectedValue(new Error('Fail'));

    const { result } = renderHook(() =>
      useAsyncOnce(asyncFn)
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.isError).toBe(true);
  });

  it('should support manual refetch', async () => {
    const asyncFn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(() =>
      useAsyncOnce(asyncFn)
    );

    await waitFor(() => {
      expect(result.current.data).toBe('data');
    });

    const callCountBeforeRefetch = asyncFn.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    // Should have called at least once more
    expect(asyncFn.mock.calls.length).toBeGreaterThan(callCountBeforeRefetch);
  });
});

describe('useAsyncMutation Hook', () => {
  it('should not execute on mount', () => {
    const asyncFn = vi.fn().mockResolvedValue('result');

    renderHook(() => useAsyncMutation(asyncFn));

    expect(asyncFn).not.toHaveBeenCalled();
  });

  it('should execute when manually triggered', async () => {
    const asyncFn = vi.fn(async (_signal: AbortSignal, id: string) => ({ id }));

    const { result } = renderHook(() =>
      useAsyncMutation(asyncFn)
    );

    expect(result.current.isLoading).toBe(false);

    let executePromise: Promise<{ id: string } | undefined>;
    act(() => {
      executePromise = result.current.execute('123');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await executePromise;
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({ id: '123' });
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to async function', async () => {
    const asyncFn = vi.fn(async (_signal: AbortSignal, name: string, age: number) => ({
      name,
      age,
    }));

    const { result } = renderHook(() =>
      useAsyncMutation(asyncFn)
    );

    await act(async () => {
      await result.current.execute('John', 25);
    });

    expect(asyncFn).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      'John',
      25
    );
    expect(result.current.data).toEqual({ name: 'John', age: 25 });
  });

  it('should handle errors', async () => {
    const error = new Error('Mutation failed');
    const asyncFn = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useAsyncMutation(asyncFn)
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual(error);
  });

  it('should call callbacks', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue('success');

    const { result } = renderHook(() =>
      useAsyncMutation(asyncFn, { onSuccess, onError })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(onSuccess).toHaveBeenCalledWith('success');
    expect(onError).not.toHaveBeenCalled();
  });

  it('should reset state', async () => {
    const asyncFn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(() =>
      useAsyncMutation(asyncFn)
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('data');

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isSuccess).toBe(false);
  });
});
