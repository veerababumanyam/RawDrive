/**
 * Tests for AvatarEditorControls Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvatarEditorControls } from '../AvatarEditorControls';

describe('AvatarEditorControls', () => {
  const defaultProps = {
    zoom: 1,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    enableRotation: true,
    enableFlip: true,
    enableFilters: true,
    onZoomChange: vi.fn(),
    onRotationChange: vi.fn(),
    onRotate90: vi.fn(),
    onFlipH: vi.fn(),
    onFlipV: vi.fn(),
    onBrightnessChange: vi.fn(),
    onContrastChange: vi.fn(),
    onSaturationChange: vi.fn(),
    onResetTransforms: vi.fn(),
    onResetFilters: vi.fn(),
    onResetAll: vi.fn(),
    isDirty: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render zoom controls', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom level')).toBeInTheDocument();
    });

    it('should render rotation controls when enabled', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      expect(screen.getByText('Rotation')).toBeInTheDocument();
      expect(screen.getByLabelText('Rotate 90° counter-clockwise')).toBeInTheDocument();
      expect(screen.getByLabelText('Rotate 90° clockwise')).toBeInTheDocument();
    });

    it('should not render rotation controls when disabled', () => {
      render(<AvatarEditorControls {...defaultProps} enableRotation={false} />);

      expect(screen.queryByText('Rotation')).not.toBeInTheDocument();
    });

    it('should render flip controls when enabled', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      expect(screen.getByText('Flip')).toBeInTheDocument();
      expect(screen.getByLabelText('Flip horizontal')).toBeInTheDocument();
      expect(screen.getByLabelText('Flip vertical')).toBeInTheDocument();
    });

    it('should not render flip controls when disabled', () => {
      render(<AvatarEditorControls {...defaultProps} enableFlip={false} />);

      expect(screen.queryByText('Flip')).not.toBeInTheDocument();
    });

    it('should render filter controls toggle when enabled', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      expect(screen.getByText('Adjustments')).toBeInTheDocument();
    });

    it('should not render filter controls when disabled', () => {
      render(<AvatarEditorControls {...defaultProps} enableFilters={false} />);

      expect(screen.queryByText('Adjustments')).not.toBeInTheDocument();
    });
  });

  describe('Zoom Controls', () => {
    it('should call onZoomChange when zoom slider changes', async () => {
      vi.useFakeTimers();
      render(<AvatarEditorControls {...defaultProps} />);

      const slider = screen.getByLabelText('Zoom level');
      fireEvent.change(slider, { target: { value: '2' } });

      // Wait for debounce (16ms)
      await vi.advanceTimersByTimeAsync(20);
      expect(defaultProps.onZoomChange).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should call onZoomChange when zoom in button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} zoom={1} />);

      await user.click(screen.getByLabelText('Zoom in'));

      expect(defaultProps.onZoomChange).toHaveBeenCalled();
    });

    it('should call onZoomChange when zoom out button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} zoom={2} />);

      await user.click(screen.getByLabelText('Zoom out'));

      expect(defaultProps.onZoomChange).toHaveBeenCalled();
    });
  });

  describe('Rotation Controls', () => {
    it('should call onRotate90 with "cw" when clockwise button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      await user.click(screen.getByLabelText('Rotate 90° clockwise'));

      expect(defaultProps.onRotate90).toHaveBeenCalledWith('cw');
    });

    it('should call onRotate90 with "ccw" when counter-clockwise button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      await user.click(screen.getByLabelText('Rotate 90° counter-clockwise'));

      expect(defaultProps.onRotate90).toHaveBeenCalledWith('ccw');
    });

    it('should call onRotationChange when rotation slider changes', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      const slider = screen.getByLabelText('Rotation angle');
      fireEvent.change(slider, { target: { value: '45' } });

      expect(defaultProps.onRotationChange).toHaveBeenCalledWith(45);
    });
  });

  describe('Flip Controls', () => {
    it('should call onFlipH when horizontal flip button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      await user.click(screen.getByLabelText('Flip horizontal'));

      expect(defaultProps.onFlipH).toHaveBeenCalled();
    });

    it('should call onFlipV when vertical flip button clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      await user.click(screen.getByLabelText('Flip vertical'));

      expect(defaultProps.onFlipV).toHaveBeenCalled();
    });

    it('should show active state when flip is enabled', () => {
      render(<AvatarEditorControls {...defaultProps} flipHorizontal={true} />);

      const button = screen.getByLabelText('Flip horizontal');
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Filter Controls', () => {
    it('should expand filter section when clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      // Initially, filter sliders should not be visible
      expect(screen.queryByLabelText('Brightness adjustment')).not.toBeInTheDocument();

      // Click to expand
      await user.click(screen.getByText('Adjustments'));

      // Now filter sliders should be visible
      expect(screen.getByLabelText('Brightness adjustment')).toBeInTheDocument();
      expect(screen.getByLabelText('Contrast adjustment')).toBeInTheDocument();
      expect(screen.getByLabelText('Saturation adjustment')).toBeInTheDocument();
    });

    it('should show indicator dot when filters are applied', () => {
      render(<AvatarEditorControls {...defaultProps} brightness={50} />);

      expect(screen.getByLabelText('Filters applied')).toBeInTheDocument();
    });

    it('should call onBrightnessChange when brightness slider changes', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      // Expand filters
      await user.click(screen.getByText('Adjustments'));

      const slider = screen.getByLabelText('Brightness adjustment');
      fireEvent.change(slider, { target: { value: '30' } });

      expect(defaultProps.onBrightnessChange).toHaveBeenCalledWith(30);
    });

    it('should call onContrastChange when contrast slider changes', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      // Expand filters
      await user.click(screen.getByText('Adjustments'));

      const slider = screen.getByLabelText('Contrast adjustment');
      fireEvent.change(slider, { target: { value: '-20' } });

      expect(defaultProps.onContrastChange).toHaveBeenCalledWith(-20);
    });

    it('should call onSaturationChange when saturation slider changes', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      // Expand filters
      await user.click(screen.getByText('Adjustments'));

      const slider = screen.getByLabelText('Saturation adjustment');
      fireEvent.change(slider, { target: { value: '50' } });

      expect(defaultProps.onSaturationChange).toHaveBeenCalledWith(50);
    });
  });

  describe('Reset Controls', () => {
    it('should show reset buttons when dirty', () => {
      render(<AvatarEditorControls {...defaultProps} isDirty={true} />);

      expect(screen.getByText('Reset all')).toBeInTheDocument();
    });

    it('should not show reset buttons when not dirty', () => {
      render(<AvatarEditorControls {...defaultProps} isDirty={false} />);

      expect(screen.queryByText('Reset all')).not.toBeInTheDocument();
    });

    it('should call onResetAll when reset all clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} isDirty={true} />);

      await user.click(screen.getByText('Reset all'));

      expect(defaultProps.onResetAll).toHaveBeenCalled();
    });

    it('should call onResetTransforms when reset transforms clicked', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} isDirty={true} zoom={2} />);

      await user.click(screen.getByText('Reset transforms'));

      expect(defaultProps.onResetTransforms).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels on all buttons', () => {
      render(<AvatarEditorControls {...defaultProps} />);

      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
      expect(screen.getByLabelText('Rotate 90° clockwise')).toBeInTheDocument();
      expect(screen.getByLabelText('Rotate 90° counter-clockwise')).toBeInTheDocument();
      expect(screen.getByLabelText('Flip horizontal')).toBeInTheDocument();
      expect(screen.getByLabelText('Flip vertical')).toBeInTheDocument();
    });

    it('should have proper aria attributes on sliders', () => {
      render(<AvatarEditorControls {...defaultProps} zoom={1.5} />);

      const zoomSlider = screen.getByLabelText('Zoom level');
      expect(zoomSlider).toHaveAttribute('aria-valuemin', '0.5');
      expect(zoomSlider).toHaveAttribute('aria-valuemax', '3');
      expect(zoomSlider).toHaveAttribute('aria-valuenow', '1.5');
    });

    it('should have aria-expanded on adjustments section', async () => {
      const user = userEvent.setup();
      render(<AvatarEditorControls {...defaultProps} />);

      // Find the button that contains "Adjustments" text
      const button = screen.getByRole('button', { name: /adjustments/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
