/**
 * Tests for AvatarEditorModal Component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvatarEditorModal } from '../AvatarEditorModal';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

// Mock createPortal
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock react-easy-crop
vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }: { onCropComplete?: (area: unknown, pixels: unknown) => void }) => {
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
    loadImage: vi.fn(),
    clearImage: vi.fn(),
    setZoom: vi.fn(),
    setPan: vi.fn(),
    setRotation: vi.fn(),
    rotate90: vi.fn(),
    toggleFlipH: vi.fn(),
    toggleFlipV: vi.fn(),
    setBrightness: vi.fn(),
    setContrast: vi.fn(),
    setSaturation: vi.fn(),
    setCropArea: vi.fn(),
    resetTransforms: vi.fn(),
    resetFilters: vi.fn(),
    resetAll: vi.fn(),
    exportImage: vi.fn().mockResolvedValue({
      file: new File(['test'], 'avatar.webp', { type: 'image/webp' }),
      cropData: { crop_x: 50, crop_y: 50, crop_scale: 1 },
    }),
  }),
}));

describe('AvatarEditorModal', () => {
  const defaultProps = {
    isOpen: true,
    imageSrc: 'https://example.com/test.jpg',
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up body scroll style
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('should render when isOpen is true', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<AvatarEditorModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render with custom title', () => {
      render(<AvatarEditorModal {...defaultProps} title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should render with default title', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      expect(screen.getByText('Edit Photo')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria attributes', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'avatar-editor-title');
    });

    it('should have proper heading structure', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      const heading = screen.getByRole('heading', { name: 'Edit Photo' });
      expect(heading).toHaveAttribute('id', 'avatar-editor-title');
    });
  });

  describe('Close Actions', () => {
    it('should call onCancel when close button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorModal {...defaultProps} />);

      await user.click(screen.getByLabelText('Close'));

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should call onCancel when backdrop clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorModal {...defaultProps} />);

      // Find the backdrop (the outer motion.div with click handler)
      const backdrop = screen.getByRole('dialog').parentElement;
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should call onCancel when Escape key pressed', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });

  describe('Body Scroll Lock', () => {
    it('should lock body scroll when modal opens', () => {
      render(<AvatarEditorModal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when modal closes', () => {
      const { rerender } = render(<AvatarEditorModal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<AvatarEditorModal {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Confirmation Dialog', () => {
    it('should not show confirmation dialog when confirmOnClose is false', async () => {
      const user = userEvent.setup();
      render(
        <AvatarEditorModal {...defaultProps} confirmOnClose={false} />
      );

      // Simulate making changes
      await user.click(screen.getByLabelText('Close'));

      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });
});
