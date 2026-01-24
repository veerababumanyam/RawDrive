/**
 * Tests for useAvatarEditor Hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAvatarEditor, validateImageFile, validateImageDimensions } from '../useAvatarEditor';

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockObjectUrl = 'blob:http://localhost:3000/test-blob';
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => mockObjectUrl),
  revokeObjectURL: vi.fn(),
});

// Mock Image
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  crossOrigin = '';
  src = '';
  naturalWidth = 500;
  naturalHeight = 500;

  constructor() {
    setTimeout(() => {
      this.onload?.();
    }, 10);
  }

  addEventListener(event: string, handler: () => void) {
    if (event === 'load') this.onload = handler;
    if (event === 'error') this.onerror = handler as (error: Error) => void;
  }
}

vi.stubGlobal('Image', MockImage);

// Mock FileReader
class MockFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = 'data:image/png;base64,test';

  readAsDataURL() {
    setTimeout(() => {
      this.onload?.();
    }, 10);
  }
}

vi.stubGlobal('FileReader', MockFileReader);

describe('useAvatarEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial state with no image loaded', () => {
      const { result } = renderHook(() => useAvatarEditor());

      expect(result.current.imageSrc).toBeNull();
      expect(result.current.imageLoaded).toBe(false);
      expect(result.current.isDownsampling).toBe(false);
      expect(result.current.isDownsampled).toBe(false);
      expect(result.current.zoom).toBe(1);
      expect(result.current.pan).toEqual({ x: 0, y: 0 });
      expect(result.current.rotation).toBe(0);
      expect(result.current.flipHorizontal).toBe(false);
      expect(result.current.flipVertical).toBe(false);
      expect(result.current.filters).toEqual({
        brightness: 0,
        contrast: 0,
        saturation: 0,
      });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.canSave).toBe(false);
    });
  });

  describe('Image Loading', () => {
    it('should load image from URL', async () => {
      const { result } = renderHook(() => useAvatarEditor());

      await act(async () => {
        await result.current.loadImage('https://example.com/test.jpg');
      });

      await waitFor(() => {
        expect(result.current.imageLoaded).toBe(true);
      });
    });

    it('should load image from File', async () => {
      const { result } = renderHook(() => useAvatarEditor());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.loadImage(file);
      });

      await waitFor(() => {
        expect(result.current.imageLoaded).toBe(true);
      });
    });

    it('should clear image', async () => {
      const { result } = renderHook(() => useAvatarEditor());

      await act(async () => {
        await result.current.loadImage('https://example.com/test.jpg');
      });

      await waitFor(() => {
        expect(result.current.imageLoaded).toBe(true);
      });

      act(() => {
        result.current.clearImage();
      });

      expect(result.current.imageSrc).toBeNull();
      expect(result.current.imageLoaded).toBe(false);
    });
  });

  describe('Transform Actions', () => {
    it('should update zoom within range', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setZoom(2.5);
      });

      expect(result.current.zoom).toBe(2.5);
      expect(result.current.isDirty).toBe(true);
    });

    it('should clamp zoom to min/max', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setZoom(0.1); // Below min
      });
      expect(result.current.zoom).toBe(0.5);

      act(() => {
        result.current.setZoom(5); // Above max
      });
      expect(result.current.zoom).toBe(3);
    });

    it('should update pan position', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setPan({ x: 10, y: 20 });
      });

      expect(result.current.pan).toEqual({ x: 10, y: 20 });
      expect(result.current.isDirty).toBe(true);
    });

    it('should rotate by 90 degrees', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.rotate90('cw');
      });
      expect(result.current.rotation).toBe(90);

      act(() => {
        result.current.rotate90('ccw');
      });
      expect(result.current.rotation).toBe(0);
    });

    it('should normalize rotation to -180 to 180 range', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setRotation(180);
        result.current.rotate90('cw');
      });
      // 180 + 90 = 270, normalized to -90
      expect(result.current.rotation).toBe(-90);
    });

    it('should toggle flip horizontal', () => {
      const { result } = renderHook(() => useAvatarEditor());

      expect(result.current.flipHorizontal).toBe(false);

      act(() => {
        result.current.toggleFlipH();
      });
      expect(result.current.flipHorizontal).toBe(true);

      act(() => {
        result.current.toggleFlipH();
      });
      expect(result.current.flipHorizontal).toBe(false);
    });

    it('should toggle flip vertical', () => {
      const { result } = renderHook(() => useAvatarEditor());

      expect(result.current.flipVertical).toBe(false);

      act(() => {
        result.current.toggleFlipV();
      });
      expect(result.current.flipVertical).toBe(true);
    });
  });

  describe('Filter Actions', () => {
    it('should update brightness within range', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setBrightness(50);
      });

      expect(result.current.filters.brightness).toBe(50);
      expect(result.current.isDirty).toBe(true);
    });

    it('should clamp brightness to min/max', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setBrightness(150); // Above max
      });
      expect(result.current.filters.brightness).toBe(100);

      act(() => {
        result.current.setBrightness(-150); // Below min
      });
      expect(result.current.filters.brightness).toBe(-100);
    });

    it('should update contrast', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setContrast(30);
      });

      expect(result.current.filters.contrast).toBe(30);
    });

    it('should update saturation', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setSaturation(-50);
      });

      expect(result.current.filters.saturation).toBe(-50);
    });
  });

  describe('Reset Actions', () => {
    it('should reset transforms only', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setZoom(2);
        result.current.setRotation(45);
        result.current.toggleFlipH();
        result.current.setBrightness(50);
      });

      act(() => {
        result.current.resetTransforms();
      });

      expect(result.current.zoom).toBe(1);
      expect(result.current.rotation).toBe(0);
      expect(result.current.flipHorizontal).toBe(false);
      expect(result.current.filters.brightness).toBe(50); // Filters preserved
    });

    it('should reset filters only', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setZoom(2);
        result.current.setBrightness(50);
        result.current.setContrast(30);
        result.current.setSaturation(-20);
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.zoom).toBe(2); // Transforms preserved
      expect(result.current.filters.brightness).toBe(0);
      expect(result.current.filters.contrast).toBe(0);
      expect(result.current.filters.saturation).toBe(0);
    });

    it('should reset all', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setZoom(2);
        result.current.setRotation(45);
        result.current.toggleFlipH();
        result.current.setBrightness(50);
      });

      act(() => {
        result.current.resetAll();
      });

      expect(result.current.zoom).toBe(1);
      expect(result.current.rotation).toBe(0);
      expect(result.current.flipHorizontal).toBe(false);
      expect(result.current.filters.brightness).toBe(0);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('CSS Filters', () => {
    it('should return "none" when no filters applied', () => {
      const { result } = renderHook(() => useAvatarEditor());
      expect(result.current.cssFilters).toBe('none');
    });

    it('should generate correct CSS filter string', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setBrightness(20);
        result.current.setContrast(10);
        result.current.setSaturation(-30);
      });

      expect(result.current.cssFilters).toBe(
        'brightness(120%) contrast(110%) saturate(70%)'
      );
    });

    it('should only include non-zero filter values', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setBrightness(20);
      });

      expect(result.current.cssFilters).toBe('brightness(120%)');
    });
  });

  describe('Crop Area', () => {
    it('should update crop area', () => {
      const { result } = renderHook(() => useAvatarEditor());

      act(() => {
        result.current.setCropArea({ x: 10, y: 20, width: 100, height: 100 });
      });

      expect(result.current.croppedAreaPixels).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
    });
  });
});

describe('validateImageFile', () => {
  it('should accept valid image types', () => {
    const jpegFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const pngFile = new File(['test'], 'test.png', { type: 'image/png' });
    const webpFile = new File(['test'], 'test.webp', { type: 'image/webp' });
    const gifFile = new File(['test'], 'test.gif', { type: 'image/gif' });

    expect(validateImageFile(jpegFile)).toEqual({ valid: true });
    expect(validateImageFile(pngFile)).toEqual({ valid: true });
    expect(validateImageFile(webpFile)).toEqual({ valid: true });
    expect(validateImageFile(gifFile)).toEqual({ valid: true });
  });

  it('should reject unsupported file types', () => {
    const pdfFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    const result = validateImageFile(pdfFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('should reject files exceeding max size', () => {
    // Create a file larger than 10MB
    const largeContent = new Array(11 * 1024 * 1024).fill('x').join('');
    const largeFile = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
    const result = validateImageFile(largeFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
  });
});

describe('validateImageDimensions', () => {
  it('should accept valid dimensions', () => {
    expect(validateImageDimensions(500, 500)).toEqual({ valid: true });
    expect(validateImageDimensions(100, 100)).toEqual({ valid: true });
    expect(validateImageDimensions(8000, 8000)).toEqual({ valid: true });
  });

  it('should reject too small dimensions', () => {
    const result = validateImageDimensions(50, 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too small');
  });

  it('should reject too large dimensions', () => {
    const result = validateImageDimensions(10000, 10000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
  });
});
