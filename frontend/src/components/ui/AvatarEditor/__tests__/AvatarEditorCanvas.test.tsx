/**
 * Tests for AvatarEditorCanvas Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvatarEditorCanvas } from '../AvatarEditorCanvas';

// Mock react-easy-crop
vi.mock('react-easy-crop', () => ({
  default: ({ image, zoom, rotation, cropShape }: {
    image: string;
    zoom: number;
    rotation: number;
    cropShape: string;
  }) => (
    <div
      data-testid="cropper"
      data-image={image}
      data-zoom={zoom}
      data-rotation={rotation}
      data-crop-shape={cropShape}
    >
      Mock Cropper
    </div>
  ),
}));

// Mock useTouchGestures
vi.mock('../../../../hooks/useTouchGestures', () => ({
  useTouchGestures: () => ({
    bind: () => ({}),
    isGestureActive: false,
  }),
}));

describe('AvatarEditorCanvas', () => {
  const defaultProps = {
    imageSrc: 'https://example.com/test.jpg',
    crop: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    aspect: 1,
    cropShape: 'round' as const,
    cssFilters: 'none',
    flipHorizontal: false,
    flipVertical: false,
    onCropChange: vi.fn(),
    onZoomChange: vi.fn(),
    onCropComplete: vi.fn(),
  };

  it('should render the cropper component', () => {
    render(<AvatarEditorCanvas {...defaultProps} />);

    expect(screen.getByTestId('cropper')).toBeInTheDocument();
  });

  it('should pass image source to cropper', () => {
    render(<AvatarEditorCanvas {...defaultProps} />);

    expect(screen.getByTestId('cropper')).toHaveAttribute(
      'data-image',
      'https://example.com/test.jpg'
    );
  });

  it('should pass zoom value to cropper', () => {
    render(<AvatarEditorCanvas {...defaultProps} zoom={2} />);

    expect(screen.getByTestId('cropper')).toHaveAttribute('data-zoom', '2');
  });

  it('should pass rotation value to cropper', () => {
    render(<AvatarEditorCanvas {...defaultProps} rotation={45} />);

    expect(screen.getByTestId('cropper')).toHaveAttribute('data-rotation', '45');
  });

  it('should pass crop shape to cropper', () => {
    render(<AvatarEditorCanvas {...defaultProps} cropShape="rect" />);

    expect(screen.getByTestId('cropper')).toHaveAttribute('data-crop-shape', 'rect');
  });

  it('should display gesture instructions', () => {
    render(<AvatarEditorCanvas {...defaultProps} />);

    // Check for desktop and mobile instructions (both are rendered, one hidden via CSS)
    const zoomInstructions = screen.getAllByText(/to zoom/i);
    const panInstructions = screen.getAllByText(/to pan/i);
    expect(zoomInstructions.length).toBeGreaterThan(0);
    expect(panInstructions.length).toBeGreaterThan(0);
  });

  it('should render with round crop shape by default', () => {
    render(<AvatarEditorCanvas {...defaultProps} />);

    expect(screen.getByTestId('cropper')).toHaveAttribute('data-crop-shape', 'round');
  });
});
