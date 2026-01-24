/**
 * Tests for useImageTransform Hook
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useImageTransform } from '../useImageTransform';

describe('useImageTransform', () => {
  describe('getPreviewTransform', () => {
    it('should return "none" when no transforms applied', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(transform).toBe('none');
    });

    it('should return rotation transform', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 45,
        flipHorizontal: false,
        flipVertical: false,
      });

      expect(transform).toBe('rotate(45deg)');
    });

    it('should return flip transform for horizontal flip', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: true,
        flipVertical: false,
      });

      expect(transform).toBe('scale(-1, 1)');
    });

    it('should return flip transform for vertical flip', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: false,
        flipVertical: true,
      });

      expect(transform).toBe('scale(1, -1)');
    });

    it('should return combined flip transform', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: true,
        flipVertical: true,
      });

      expect(transform).toBe('scale(-1, -1)');
    });

    it('should return combined rotation and flip transform', () => {
      const { result } = renderHook(() => useImageTransform());

      const transform = result.current.getPreviewTransform({
        zoom: 1,
        pan: { x: 0, y: 0 },
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
      });

      expect(transform).toBe('rotate(90deg) scale(-1, 1)');
    });
  });

  describe('getTransformedBounds', () => {
    it('should return original bounds for 0 degree rotation', () => {
      const { result } = renderHook(() => useImageTransform());

      const bounds = result.current.getTransformedBounds(
        {
          zoom: 1,
          pan: { x: 0, y: 0 },
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
        },
        { width: 100, height: 50 }
      );

      expect(bounds).toEqual({ width: 100, height: 50 });
    });

    it('should return original bounds for 180 degree rotation', () => {
      const { result } = renderHook(() => useImageTransform());

      const bounds = result.current.getTransformedBounds(
        {
          zoom: 1,
          pan: { x: 0, y: 0 },
          rotation: 180,
          flipHorizontal: false,
          flipVertical: false,
        },
        { width: 100, height: 50 }
      );

      expect(bounds).toEqual({ width: 100, height: 50 });
    });

    it('should swap dimensions for 90 degree rotation', () => {
      const { result } = renderHook(() => useImageTransform());

      const bounds = result.current.getTransformedBounds(
        {
          zoom: 1,
          pan: { x: 0, y: 0 },
          rotation: 90,
          flipHorizontal: false,
          flipVertical: false,
        },
        { width: 100, height: 50 }
      );

      expect(bounds).toEqual({ width: 50, height: 100 });
    });

    it('should swap dimensions for -90 degree rotation', () => {
      const { result } = renderHook(() => useImageTransform());

      const bounds = result.current.getTransformedBounds(
        {
          zoom: 1,
          pan: { x: 0, y: 0 },
          rotation: -90,
          flipHorizontal: false,
          flipVertical: false,
        },
        { width: 100, height: 50 }
      );

      expect(bounds).toEqual({ width: 50, height: 100 });
    });

    it('should calculate bounding box for 45 degree rotation', () => {
      const { result } = renderHook(() => useImageTransform());

      const bounds = result.current.getTransformedBounds(
        {
          zoom: 1,
          pan: { x: 0, y: 0 },
          rotation: 45,
          flipHorizontal: false,
          flipVertical: false,
        },
        { width: 100, height: 100 }
      );

      // For a 100x100 square rotated 45 degrees:
      // new dimension = 100 * cos(45) + 100 * sin(45) ≈ 141.42
      expect(bounds.width).toBeGreaterThan(140);
      expect(bounds.width).toBeLessThan(143);
      expect(bounds.height).toBeGreaterThan(140);
      expect(bounds.height).toBeLessThan(143);
    });
  });

  describe('getFilterString', () => {
    it('should return "none" when no filters applied', () => {
      const { result } = renderHook(() => useImageTransform());

      const filter = result.current.getFilterString({
        brightness: 0,
        contrast: 0,
        saturation: 0,
      });

      expect(filter).toBe('none');
    });

    it('should return brightness filter', () => {
      const { result } = renderHook(() => useImageTransform());

      const filter = result.current.getFilterString({
        brightness: 20,
        contrast: 0,
        saturation: 0,
      });

      expect(filter).toBe('brightness(120%)');
    });

    it('should return contrast filter', () => {
      const { result } = renderHook(() => useImageTransform());

      const filter = result.current.getFilterString({
        brightness: 0,
        contrast: -30,
        saturation: 0,
      });

      expect(filter).toBe('contrast(70%)');
    });

    it('should return saturation filter', () => {
      const { result } = renderHook(() => useImageTransform());

      const filter = result.current.getFilterString({
        brightness: 0,
        contrast: 0,
        saturation: 50,
      });

      expect(filter).toBe('saturate(150%)');
    });

    it('should return combined filters', () => {
      const { result } = renderHook(() => useImageTransform());

      const filter = result.current.getFilterString({
        brightness: 10,
        contrast: 20,
        saturation: -10,
      });

      expect(filter).toBe('brightness(110%) contrast(120%) saturate(90%)');
    });
  });
});
