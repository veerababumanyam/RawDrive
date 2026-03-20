import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfileAutoSave } from './useProfileAutoSave';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdatePersonal = vi.fn().mockResolvedValue({});
const mockUpdateCompany = vi.fn().mockResolvedValue({});
const mockAddToast = vi.fn();

vi.mock('@/services/personalProfileService', () => ({
  personalProfileService: {
    updateProfile: (...args: unknown[]) => mockUpdatePersonal(...args),
  },
}));

vi.mock('@/services/companyProfileService', () => ({
  companyProfileService: {
    updateProfile: (...args: unknown[]) => mockUpdateCompany(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    workspace: { workspace_id: 'ws-test-123' },
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// Minimal QueryClient wrapper for TanStack Query
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProfileAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire save when isDirty is false', async () => {
    const onSaved = vi.fn();

    renderHook(
      () =>
        useProfileAutoSave({
          profileType: 'personal',
          profileData: { display_name: 'Test' },
          isDirty: false,
          onSaved,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockUpdatePersonal).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('fires save after 2000ms when isDirty becomes true', async () => {
    const onSaved = vi.fn();

    renderHook(
      () =>
        useProfileAutoSave({
          profileType: 'personal',
          profileData: { display_name: 'Updated' },
          isDirty: true,
          onSaved,
        }),
      { wrapper: createWrapper() },
    );

    // Should not fire before 2000ms
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(mockUpdatePersonal).not.toHaveBeenCalled();

    // Should fire at 2000ms
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(mockUpdatePersonal).toHaveBeenCalledWith('ws-test-123', { display_name: 'Updated' });
  });

  it('resets timer when data changes while dirty', async () => {
    const onSaved = vi.fn();

    const { rerender } = renderHook(
      ({ data }) =>
        useProfileAutoSave({
          profileType: 'personal',
          profileData: data,
          isDirty: true,
          onSaved,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { data: { display_name: 'First' } as Record<string, unknown> },
      },
    );

    // Advance 1500ms
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockUpdatePersonal).not.toHaveBeenCalled();

    // Change data - should reset timer
    rerender({ data: { display_name: 'Second' } });

    // Advance another 1500ms (3000ms total, but only 1500 since last change)
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockUpdatePersonal).not.toHaveBeenCalled();

    // Advance to 2000ms after last change
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockUpdatePersonal).toHaveBeenCalledTimes(1);
    expect(mockUpdatePersonal).toHaveBeenCalledWith('ws-test-123', { display_name: 'Second' });
  });

  it('calls onSaved callback after successful save', async () => {
    const onSaved = vi.fn();
    mockUpdatePersonal.mockResolvedValueOnce({ display_name: 'Saved' });

    renderHook(
      () =>
        useProfileAutoSave({
          profileType: 'personal',
          profileData: { display_name: 'Save me' },
          isDirty: true,
          onSaved,
        }),
      { wrapper: createWrapper() },
    );

    // Trigger save
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Flush the mutation promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onSaved).toHaveBeenCalled();
  });
});
