/**
 * Unit Tests for usePublicProfileTheme Hook
 *
 * Tests theme management for public profile pages including:
 * - System preference detection
 * - Manual theme toggle
 * - localStorage persistence
 * - System preference change handling
 *
 * Feature: 021-public-profile-mobile-responsive-theme
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublicProfileTheme, type PublicProfileTheme } from '../usePublicProfileTheme';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

// Mock matchMedia
const createMatchMedia = (prefersDark: boolean) => {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mediaQueryList = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn((callback: (e: MediaQueryListEvent) => void) => {
      listeners.push(callback);
    }),
    removeListener: vi.fn((callback: (e: MediaQueryListEvent) => void) => {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }),
    addEventListener: vi.fn((event: string, callback: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') listeners.push(callback);
    }),
    removeEventListener: vi.fn((event: string, callback: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    }),
    dispatchEvent: vi.fn(() => true),
    // Helper to simulate preference change
    _triggerChange: (newPrefersDark: boolean) => {
      mediaQueryList.matches = newPrefersDark;
      listeners.forEach((listener) => {
        listener({ matches: newPrefersDark } as MediaQueryListEvent);
      });
    },
  };

  return vi.fn(() => mediaQueryList);
};

const STORAGE_KEY = 'rawdrive-public-profile-theme';

describe('usePublicProfileTheme', () => {
  let mockMatchMedia: ReturnType<typeof createMatchMedia>;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();

    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Default to light mode system preference
    mockMatchMedia = createMatchMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should default to light theme when system prefers light', () => {
      mockMatchMedia = createMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.systemPreference).toBe('light');
      expect(result.current.isSystemTheme).toBe(true);
    });

    it('should default to dark theme when system prefers dark', () => {
      mockMatchMedia = createMatchMedia(true);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.systemPreference).toBe('dark');
      expect(result.current.isSystemTheme).toBe(true);
    });

    it('should use stored theme preference over system preference', () => {
      localStorageMock.setItem(STORAGE_KEY, 'dark');
      mockMatchMedia = createMatchMedia(false); // System prefers light
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.systemPreference).toBe('light');
      expect(result.current.isSystemTheme).toBe(false);
    });
  });

  describe('Theme Toggle', () => {
    it('should toggle from light to dark', () => {
      mockMatchMedia = createMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(false);
    });

    it('should toggle from dark to light', () => {
      mockMatchMedia = createMatchMedia(true);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('dark');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.isSystemTheme).toBe(false);
    });

    it('should persist theme preference after toggle', () => {
      mockMatchMedia = createMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');
    });
  });

  describe('setTheme', () => {
    it('should set theme to dark explicitly', () => {
      mockMatchMedia = createMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');
    });

    it('should set theme to light explicitly', () => {
      mockMatchMedia = createMatchMedia(true);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.isSystemTheme).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'light');
    });
  });

  describe('System Preference Changes', () => {
    it('should update systemPreference when system preference changes', () => {
      const matchMediaMock = createMatchMedia(false);
      window.matchMedia = matchMediaMock;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.systemPreference).toBe('light');

      // Simulate system preference change to dark
      act(() => {
        const mediaQueryList = matchMediaMock();
        (mediaQueryList as any)._triggerChange(true);
      });

      expect(result.current.systemPreference).toBe('dark');
    });

    it('should update theme when following system preference', () => {
      const matchMediaMock = createMatchMedia(false);
      window.matchMedia = matchMediaMock;

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.isSystemTheme).toBe(true);

      // Simulate system preference change to dark
      act(() => {
        const mediaQueryList = matchMediaMock();
        (mediaQueryList as any)._triggerChange(true);
      });

      // Theme should follow system when no manual preference set
      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(true);
    });

    it('should NOT update theme when manual preference is set', () => {
      const matchMediaMock = createMatchMedia(false);
      window.matchMedia = matchMediaMock;

      const { result } = renderHook(() => usePublicProfileTheme());

      // Set manual preference
      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(false);

      // Simulate system preference change
      act(() => {
        const mediaQueryList = matchMediaMock();
        (mediaQueryList as any)._triggerChange(true);
      });

      // Theme should NOT change because manual preference is set
      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(false);
    });
  });

  describe('localStorage Handling', () => {
    it('should read theme from localStorage on mount', () => {
      localStorageMock.setItem(STORAGE_KEY, 'dark');

      const { result } = renderHook(() => usePublicProfileTheme());

      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY);
      expect(result.current.theme).toBe('dark');
    });

    it('should ignore invalid stored values', () => {
      localStorageMock.setItem(STORAGE_KEY, 'invalid-value');
      mockMatchMedia = createMatchMedia(false);
      window.matchMedia = mockMatchMedia;

      const { result } = renderHook(() => usePublicProfileTheme());

      // Should fall back to system preference
      expect(result.current.theme).toBe('light');
      expect(result.current.isSystemTheme).toBe(true);
    });

    it('should handle localStorage errors gracefully', () => {
      // Make localStorage throw
      localStorageMock.getItem = vi.fn(() => {
        throw new Error('localStorage not available');
      });

      mockMatchMedia = createMatchMedia(true);
      window.matchMedia = mockMatchMedia;

      // Should not throw and should use system preference
      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.isSystemTheme).toBe(true);
    });
  });

  describe('Return Value Types', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => usePublicProfileTheme());

      expect(result.current).toHaveProperty('theme');
      expect(result.current).toHaveProperty('setTheme');
      expect(result.current).toHaveProperty('toggleTheme');
      expect(result.current).toHaveProperty('isSystemTheme');
      expect(result.current).toHaveProperty('systemPreference');
    });

    it('should return theme as light or dark', () => {
      const { result } = renderHook(() => usePublicProfileTheme());

      expect(['light', 'dark']).toContain(result.current.theme);
      expect(['light', 'dark']).toContain(result.current.systemPreference);
    });

    it('should return functions for setTheme and toggleTheme', () => {
      const { result } = renderHook(() => usePublicProfileTheme());

      expect(typeof result.current.setTheme).toBe('function');
      expect(typeof result.current.toggleTheme).toBe('function');
    });

    it('should return boolean for isSystemTheme', () => {
      const { result } = renderHook(() => usePublicProfileTheme());

      expect(typeof result.current.isSystemTheme).toBe('boolean');
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount', () => {
      const matchMediaMock = createMatchMedia(false);
      window.matchMedia = matchMediaMock;

      const { unmount } = renderHook(() => usePublicProfileTheme());

      unmount();

      const mediaQueryList = matchMediaMock();
      expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });
});
