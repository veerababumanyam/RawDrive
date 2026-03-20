import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgressiveImage } from './useProgressiveImage';

// ---------------------------------------------------------------------------
// Mock the Image constructor so we can control load/error events
// ---------------------------------------------------------------------------

let mockImageInstances: Array<{
  src: string;
  onload: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}>;

beforeEach(() => {
  mockImageInstances = [];

  vi.stubGlobal(
    'Image',
    class MockImage {
      src = '';
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;

      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instance = this;
        mockImageInstances.push(instance);
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProgressiveImage', () => {
  it('returns lqip as currentSrc initially when lqip is provided', () => {
    const { result } = renderHook(() =>
      useProgressiveImage({ src: 'https://cdn.example.com/full.jpg', lqip: 'data:image/jpeg;base64,abc' }),
    );

    expect(result.current.currentSrc).toBe('data:image/jpeg;base64,abc');
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('returns full src immediately when lqip is undefined', () => {
    const { result } = renderHook(() =>
      useProgressiveImage({ src: 'https://cdn.example.com/full.jpg' }),
    );

    expect(result.current.currentSrc).toBe('https://cdn.example.com/full.jpg');
    expect(result.current.isLoaded).toBe(false);
  });

  it('transitions to full src and sets isLoaded when image loads', () => {
    const { result } = renderHook(() =>
      useProgressiveImage({ src: 'https://cdn.example.com/full.jpg', lqip: 'data:lqip' }),
    );

    // Simulate image load
    act(() => {
      const img = mockImageInstances[0];
      img.onload?.();
    });

    expect(result.current.currentSrc).toBe('https://cdn.example.com/full.jpg');
    expect(result.current.isLoaded).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('sets isError on load failure', () => {
    const { result } = renderHook(() =>
      useProgressiveImage({ src: 'https://cdn.example.com/broken.jpg', lqip: 'data:lqip' }),
    );

    act(() => {
      const img = mockImageInstances[0];
      img.onerror?.(new Error('network'));
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.isLoaded).toBe(false);
  });

  it('sets src on the hidden Image element for preloading', () => {
    renderHook(() =>
      useProgressiveImage({ src: 'https://cdn.example.com/full.jpg', lqip: 'data:lqip' }),
    );

    expect(mockImageInstances.length).toBe(1);
    expect(mockImageInstances[0].src).toBe('https://cdn.example.com/full.jpg');
  });
});
