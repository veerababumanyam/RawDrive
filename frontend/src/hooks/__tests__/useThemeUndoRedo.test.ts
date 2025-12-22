/**
 * Unit tests for useThemeUndoRedo hook
 *
 * Tests cover:
 * - Undo/Redo functionality
 * - History limit (max 10 actions)
 * - Auto-save with debouncing
 * - Reset to default
 * - isDirty state tracking
 *
 * Requirements: 8.5, 8.6, 8.15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeUndoRedo } from '../useThemeUndoRedo';
import type { ThemeCustomization } from '../../types/profileEditor';

// Mock theme customization data using correct property names
const createMockCustomization = (overrides: Partial<ThemeCustomization> = {}): Partial<ThemeCustomization> => ({
  customization_id: 'custom-1',
  workspace_id: 'workspace-1',
  theme_id: 'theme-1',
  custom_colors: {
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#06B6D4',
    neutral: ['#FFFFFF', '#F8FAFC'],
  },
  custom_typography: {
    heading_font: { family: 'Inter', source: 'web', fallback: ['sans-serif'], weights: [400, 600, 700] },
    body_font: { family: 'Inter', source: 'web', fallback: ['sans-serif'], weights: [400, 500] },
  },
  custom_layout: {
    spacing: 'normal',
    hero_style: 'card',
    section_layout: 'single-column',
  },
  is_preset: false,
  ...overrides,
});

describe('useThemeUndoRedo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with provided state', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      expect(result.current.state).toEqual(initial);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.isDirty).toBe(false);
    });

    it('should initialize with null state', () => {
      const { result } = renderHook(() =>
        useThemeUndoRedo(null)
      );

      expect(result.current.state).toBeNull();
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('Update Function', () => {
    it('should update state and add to history', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      expect(result.current.state?.custom_colors?.primary).toBe('#FF0000');
      expect(result.current.canUndo).toBe(true);
      expect(result.current.isDirty).toBe(true);
    });

    it('should clear redo history on new update', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Make two updates
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#00FF00' },
        });
      });

      // Undo once
      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).toBe(true);

      // Make new update - should clear redo
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#0000FF' },
        });
      });

      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('Undo Function', () => {
    it('should restore previous state', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Make an update
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      expect(result.current.state?.custom_colors?.primary).toBe('#FF0000');

      // Undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.state?.custom_colors?.primary).toBe('#2563EB');
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it('should do nothing when no history', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Try to undo without any changes
      act(() => {
        result.current.undo();
      });

      expect(result.current.state).toEqual(initial);
    });
  });

  describe('Redo Function', () => {
    it('should restore undone state', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Make an update
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      // Undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.state?.custom_colors?.primary).toBe('#2563EB');

      // Redo
      act(() => {
        result.current.redo();
      });

      expect(result.current.state?.custom_colors?.primary).toBe('#FF0000');
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('should do nothing when no future history', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Try to redo without any undo
      act(() => {
        result.current.redo();
      });

      expect(result.current.state).toEqual(initial);
    });
  });

  describe('Reset Function', () => {
    it('should restore to initial state', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Make multiple updates
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#00FF00' },
        });
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toEqual(initial);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('History Limit', () => {
    it('should limit history to 10 actions', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial, { maxHistory: 10 })
      );

      // Make 15 updates
      for (let i = 0; i < 15; i++) {
        act(() => {
          result.current.update({
            custom_colors: { ...initial.custom_colors!, primary: `#${i.toString().padStart(6, '0')}` },
          });
        });
      }

      // Should only be able to undo 10 times
      expect(result.current.undoCount).toBeLessThanOrEqual(10);

      // Undo 10 times
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.undo();
        });
      }

      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('Auto-Save', () => {
    it('should trigger onChange after debounce delay', async () => {
      const initial = createMockCustomization();
      const onChange = vi.fn();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial, { onChange, autoSaveDebounce: 1000 })
      );

      // Make an update
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      // onChange should not be called immediately
      expect(onChange).not.toHaveBeenCalled();

      // Fast-forward time and flush microtasks
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Now onChange should be called
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('should debounce multiple rapid updates', async () => {
      const initial = createMockCustomization();
      const onChange = vi.fn();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial, { onChange, autoSaveDebounce: 1000 })
      );

      // Make multiple rapid updates
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#00FF00' },
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#0000FF' },
        });
      });

      // Fast-forward past debounce
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // onChange should only be called once
      expect(onChange).toHaveBeenCalledTimes(1);

      // Should be called with the final state
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          custom_colors: expect.objectContaining({
            primary: '#0000FF',
          }),
        })
      );
    });
  });

  describe('isDirty State', () => {
    it('should be false initially', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      expect(result.current.isDirty).toBe(false);
    });

    it('should be true after update', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should be false after reset', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should be false after undoing all changes', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('Counts', () => {
    it('should track undo count', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      expect(result.current.undoCount).toBe(0);

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      expect(result.current.undoCount).toBe(1);

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#00FF00' },
        });
      });

      expect(result.current.undoCount).toBe(2);
    });

    it('should track redo count', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      // Make updates
      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#00FF00' },
        });
      });

      expect(result.current.redoCount).toBe(0);

      // Undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.redoCount).toBe(1);

      act(() => {
        result.current.undo();
      });

      expect(result.current.redoCount).toBe(2);
    });
  });

  describe('Save Pending State', () => {
    it('should track isSavePending during save', async () => {
      const initial = createMockCustomization();
      const onChange = vi.fn();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial, { onChange, autoSaveDebounce: 100 })
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      // Should be pending during debounce
      expect(result.current.isSavePending).toBe(true);

      // Trigger debounce and flush microtasks
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // After save completes
      expect(result.current.isSavePending).toBe(false);
    });
  });

  describe('Last Save Time', () => {
    it('should update lastSaveTime after successful save', async () => {
      const initial = createMockCustomization();
      const onChange = vi.fn();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial, { onChange, autoSaveDebounce: 100 })
      );

      expect(result.current.lastSaveTime).toBeNull();

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      // Flush timers and microtasks
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current.lastSaveTime).not.toBeNull();
    });
  });

  describe('Clear History', () => {
    it('should clear history without changing state', () => {
      const initial = createMockCustomization();

      const { result } = renderHook(() =>
        useThemeUndoRedo(initial)
      );

      act(() => {
        result.current.update({
          custom_colors: { ...initial.custom_colors!, primary: '#FF0000' },
        });
      });

      const currentState = result.current.state;
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.state).toEqual(currentState);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });
});
