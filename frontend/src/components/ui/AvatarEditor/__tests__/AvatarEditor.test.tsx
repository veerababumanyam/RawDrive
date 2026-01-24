/**
 * Tests for AvatarEditor Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvatarEditor } from '../AvatarEditor';

// Mock react-easy-crop
vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }: { onCropComplete?: (area: unknown, pixels: unknown) => void }) => {
    // Simulate crop complete after mount
    setTimeout(() => {
      onCropComplete?.(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 }
      );
    }, 10);
    return <div data-testid="cropper">Mock Cropper</div>;
  },
}));

// Mock useTouchGestures
vi.mock('../../../../hooks/useTouchGestures', () => ({
  useTouchGestures: () => ({
    bind: () => ({}),
    isGestureActive: false,
  }),
}));

// Mock useAvatarEditor
const mockLoadImage = vi.fn();
const mockExportImage = vi.fn();
const mockSetZoom = vi.fn();
const mockSetRotation = vi.fn();
const mockRotate90 = vi.fn();
const mockToggleFlipH = vi.fn();
const mockToggleFlipV = vi.fn();
const mockResetAll = vi.fn();

vi.mock('../../../../hooks/useAvatarEditor', () => ({
  useAvatarEditor: () => ({
    imageSrc: 'https://example.com/test.jpg',
    imageLoaded: true,
    isDownsampling: false,
    isDownsampled: false,
    zoom: 1,
    pan: { x: 0, y: 0 },
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    filters: { brightness: 0, contrast: 0, saturation: 0 },
    croppedAreaPixels: { x: 0, y: 0, width: 100, height: 100 },
    isDirty: false,
    isProcessing: false,
    error: null,
    cssFilters: 'none',
    canSave: true,
    loadImage: mockLoadImage,
    clearImage: vi.fn(),
    setZoom: mockSetZoom,
    setPan: vi.fn(),
    setRotation: mockSetRotation,
    rotate90: mockRotate90,
    toggleFlipH: mockToggleFlipH,
    toggleFlipV: mockToggleFlipV,
    setBrightness: vi.fn(),
    setContrast: vi.fn(),
    setSaturation: vi.fn(),
    setCropArea: vi.fn(),
    resetTransforms: vi.fn(),
    resetFilters: vi.fn(),
    resetAll: mockResetAll,
    exportImage: mockExportImage,
  }),
}));

describe('AvatarEditor', () => {
  const defaultProps = {
    file: null,
    imageSrc: 'https://example.com/test.jpg',
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExportImage.mockResolvedValue({
      file: new File(['test'], 'avatar.webp', { type: 'image/webp' }),
      cropData: { crop_x: 50, crop_y: 50, crop_scale: 1 },
    });
  });

  describe('Rendering', () => {
    it('should render the editor with canvas and controls', () => {
      render(<AvatarEditor {...defaultProps} />);

      expect(screen.getByTestId('cropper')).toBeInTheDocument();
      expect(screen.getByText('Save Photo')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <AvatarEditor {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should load image from imageSrc prop', () => {
      render(<AvatarEditor {...defaultProps} />);

      expect(mockLoadImage).toHaveBeenCalledWith('https://example.com/test.jpg');
    });

    it('should load image from file prop', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      render(<AvatarEditor {...defaultProps} file={file} imageSrc={undefined} />);

      expect(mockLoadImage).toHaveBeenCalledWith(file);
    });
  });

  describe('Actions', () => {
    it('should call onSave with file and cropData when save clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditor {...defaultProps} />);

      await user.click(screen.getByText('Save Photo'));

      await waitFor(() => {
        expect(mockExportImage).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
    });

    it('should call onCancel when cancel clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditor {...defaultProps} />);

      await user.click(screen.getByText('Cancel'));

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should disable save button when loading', () => {
      render(<AvatarEditor {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should rotate clockwise on "r" key', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'r' });

      expect(mockRotate90).toHaveBeenCalledWith('cw');
    });

    it('should rotate counter-clockwise on Shift+R', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'R', shiftKey: true });

      expect(mockRotate90).toHaveBeenCalledWith('ccw');
    });

    it('should flip horizontal on "h" key', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'h' });

      expect(mockToggleFlipH).toHaveBeenCalled();
    });

    it('should flip vertical on "v" key', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'v' });

      expect(mockToggleFlipV).toHaveBeenCalled();
    });

    it('should reset all on "0" key', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: '0' });

      expect(mockResetAll).toHaveBeenCalled();
    });

    it('should call onCancel on Escape key', () => {
      render(<AvatarEditor {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should not trigger shortcuts when typing in input', () => {
      render(<AvatarEditor {...defaultProps} />);

      // Create and append an input to the document
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      // Dispatch key event directly from the input element
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keyEvent);

      // The shortcut should NOT be triggered when focus is on an input
      expect(mockRotate90).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });

  describe('Feature Toggles', () => {
    it('should hide rotation controls when enableRotation is false', () => {
      render(<AvatarEditor {...defaultProps} enableRotation={false} />);

      expect(screen.queryByText('Rotation')).not.toBeInTheDocument();
    });

    it('should hide flip controls when enableFlip is false', () => {
      render(<AvatarEditor {...defaultProps} enableFlip={false} />);

      expect(screen.queryByText('Flip')).not.toBeInTheDocument();
    });

    it('should hide filter controls when enableFilters is false', () => {
      render(<AvatarEditor {...defaultProps} enableFilters={false} />);

      expect(screen.queryByText('Adjustments')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have screen reader instructions for keyboard shortcuts', () => {
      render(<AvatarEditor {...defaultProps} />);

      expect(screen.getByText(/keyboard shortcuts available/i)).toBeInTheDocument();
    });
  });
});
