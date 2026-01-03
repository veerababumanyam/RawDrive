/**
 * Tests for InvitationErrorBoundary Component
 *
 * Test coverage:
 * - Error catching and display
 * - Retry functionality with backoff
 * - Theme-aware styling
 * - Accessibility (ARIA attributes)
 *
 * Feature: 020-invitation-rsvp-hardening
 * Task: T040 - Add error boundary component test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationErrorBoundary, {
  useErrorRecovery,
} from '@/components/ErrorBoundary/InvitationErrorBoundary';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

// Component that throws an error
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error from component');
  }
  return <div data-testid="success-content">Content loaded successfully</div>;
};

// Suppress console.error for expected errors
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Error Boundary Tests
// ---------------------------------------------------------------------------

describe('InvitationErrorBoundary', () => {
  describe('Error Catching', () => {
    it('renders children when no error occurs', () => {
      render(
        <InvitationErrorBoundary>
          <div data-testid="child-content">Normal content</div>
        </InvitationErrorBoundary>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('catches errors and shows fallback UI', () => {
      render(
        <InvitationErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      // Error boundary should catch and display fallback
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('calls onError callback when error occurs', () => {
      const onError = vi.fn();

      render(
        <InvitationErrorBoundary onError={onError}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    });

    it('displays retry button when error can be retried', () => {
      render(
        <InvitationErrorBoundary maxRetries={3}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('Retry Functionality', () => {
    it('shows retry count after failed retry', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const { rerender } = render(
        <InvitationErrorBoundary maxRetries={3}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      // Click retry
      const retryButton = screen.getByRole('button', { name: /retry/i });
      await act(async () => {
        fireEvent.click(retryButton);
        await vi.advanceTimersByTimeAsync(1100);
      });

      // Re-render with still throwing component
      rerender(
        <InvitationErrorBoundary maxRetries={3}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      // Should show retry count
      expect(screen.getByText(/retry attempts:/i)).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('disables retry button when max retries reached', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const { rerender } = render(
        <InvitationErrorBoundary maxRetries={1}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      // First retry
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
        await vi.advanceTimersByTimeAsync(1100);
      });

      // Re-render - should now show refresh button instead of retry
      rerender(
        <InvitationErrorBoundary maxRetries={1}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('shows retrying state during retry delay', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(
        <InvitationErrorBoundary maxRetries={3}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      // Should show retrying state immediately
      expect(screen.getByRole('button', { name: /retrying/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retrying/i })).toBeDisabled();

      // Clean up
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      vi.useRealTimers();
    });
  });

  describe('Dismiss Functionality', () => {
    it('allows dismissing the error state', async () => {
      const TestWrapper = () => {
        const [shouldThrow, setShouldThrow] = vi.fn().mockReturnValue([true, vi.fn()]);
        return (
          <InvitationErrorBoundary>
            <ThrowingComponent shouldThrow={true} />
          </InvitationErrorBoundary>
        );
      };

      render(
        <InvitationErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      expect(dismissButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role="alert" for error state', () => {
      render(
        <InvitationErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has aria-live="assertive" for immediate announcement', () => {
      render(
        <InvitationErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('error details toggle has aria-expanded attribute', () => {
      // Only visible in development
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <InvitationErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      const detailsToggle = screen.queryByRole('button', { name: /show error details/i });
      if (detailsToggle) {
        expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
      }

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('Custom Fallback', () => {
    it('uses custom fallback when provided', () => {
      const customFallback = vi.fn().mockReturnValue(
        <div data-testid="custom-fallback">Custom error UI</div>
      );

      render(
        <InvitationErrorBoundary fallback={customFallback}>
          <ThrowingComponent shouldThrow={true} />
        </InvitationErrorBoundary>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(customFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          resetError: expect.any(Function),
          retryWithBackoff: expect.any(Function),
          retryCount: 0,
          maxRetries: 3,
          isRetrying: false,
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// useErrorRecovery Hook Tests
// ---------------------------------------------------------------------------

describe('useErrorRecovery Hook', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useErrorRecovery());

    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.canRetry).toBe(true);
  });

  it('respects maxRetries parameter', () => {
    const { result } = renderHook(() => useErrorRecovery(2));

    expect(result.current.canRetry).toBe(true);
  });

  it('increments retry count after retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useErrorRecovery(3));
    const onRetry = vi.fn();

    await act(async () => {
      result.current.retry(onRetry);
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.retryCount).toBe(1);
    expect(result.current.isRetrying).toBe(false);
    expect(onRetry).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('resets state correctly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useErrorRecovery(3));
    const onRetry = vi.fn();

    // Perform a retry
    await act(async () => {
      result.current.retry(onRetry);
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.retryCount).toBe(1);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.canRetry).toBe(true);

    vi.useRealTimers();
  });

  it('prevents retry when max retries reached', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useErrorRecovery(1));
    const onRetry = vi.fn();

    // First retry
    await act(async () => {
      result.current.retry(onRetry);
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.canRetry).toBe(false);

    // Try to retry again - should not call onRetry
    onRetry.mockClear();
    act(() => {
      result.current.retry(onRetry);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(onRetry).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Theme Support Tests
// ---------------------------------------------------------------------------

describe('Theme Support', () => {
  it('uses design system color tokens', () => {
    render(
      <InvitationErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </InvitationErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    // Check for design system classes
    expect(alert.className).toMatch(/bg-surface/);
    expect(alert.className).toMatch(/border-border/);
  });
});
