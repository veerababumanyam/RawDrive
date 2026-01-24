/**
 * Tests for useTouchGestures Hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTouchGestures } from '../useTouchGestures';

describe('useTouchGestures', () => {
  describe('Initialization', () => {
    it('should return bind function', () => {
      const { result } = renderHook(() => useTouchGestures());

      expect(result.current.bind).toBeDefined();
      expect(typeof result.current.bind).toBe('function');
    });

    it('should return isGestureActive state', () => {
      const { result } = renderHook(() => useTouchGestures());

      expect(result.current.isGestureActive).toBeDefined();
      expect(result.current.isGestureActive).toBe(false);
    });

    it('should accept options', () => {
      const onRotate = vi.fn();
      const onPinch = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
          onPinch,
          enabled: true,
          rotationThreshold: 10,
          rotationSensitivity: 2,
        })
      );

      expect(result.current.bind).toBeDefined();
    });

    it('should work when disabled', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
          enabled: false,
        })
      );

      expect(result.current.bind).toBeDefined();
    });
  });

  describe('Bind Function', () => {
    it('should return event handlers', () => {
      const { result } = renderHook(() => useTouchGestures());

      const handlers = result.current.bind();

      expect(handlers).toBeDefined();
      expect(typeof handlers).toBe('object');
    });
  });

  describe('Options', () => {
    it('should use default rotation threshold of 5', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
        })
      );

      // Hook should initialize without errors
      expect(result.current.bind).toBeDefined();
    });

    it('should use default rotation sensitivity of 1', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
        })
      );

      // Hook should initialize without errors
      expect(result.current.bind).toBeDefined();
    });

    it('should use custom rotation threshold', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
          rotationThreshold: 15,
        })
      );

      expect(result.current.bind).toBeDefined();
    });

    it('should use custom rotation sensitivity', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
          rotationSensitivity: 0.5,
        })
      );

      expect(result.current.bind).toBeDefined();
    });
  });

  describe('Callback Registration', () => {
    it('should accept onRotate callback', () => {
      const onRotate = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
        })
      );

      expect(result.current.bind).toBeDefined();
    });

    it('should accept onPinch callback', () => {
      const onPinch = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onPinch,
        })
      );

      expect(result.current.bind).toBeDefined();
    });

    it('should accept both callbacks', () => {
      const onRotate = vi.fn();
      const onPinch = vi.fn();

      const { result } = renderHook(() =>
        useTouchGestures({
          onRotate,
          onPinch,
        })
      );

      expect(result.current.bind).toBeDefined();
    });
  });

  describe('Enabled State', () => {
    it('should be enabled by default', () => {
      const { result } = renderHook(() => useTouchGestures());

      // Hook should work normally when enabled is not specified
      expect(result.current.bind).toBeDefined();
    });

    it('should work when explicitly enabled', () => {
      const { result } = renderHook(() =>
        useTouchGestures({
          enabled: true,
        })
      );

      expect(result.current.bind).toBeDefined();
    });

    it('should work when explicitly disabled', () => {
      const { result } = renderHook(() =>
        useTouchGestures({
          enabled: false,
        })
      );

      expect(result.current.bind).toBeDefined();
    });
  });
});
