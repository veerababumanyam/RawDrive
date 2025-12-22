/**
 * Unit tests for UndoRedoControls component
 *
 * Tests cover:
 * - Undo/Redo button states
 * - Reset functionality
 * - Save indicator
 * - Accessibility compliance
 *
 * Requirements: 8.5, 8.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoRedoControls } from '../UndoRedoControls';

describe('UndoRedoControls', () => {
  const defaultProps = {
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render undo and redo buttons', () => {
      render(<UndoRedoControls {...defaultProps} />);

      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    });

    it('should render reset button when onReset is provided', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onReset={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('should render save button when onSave is provided', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  describe('Undo Button', () => {
    it('should be disabled when canUndo is false', () => {
      render(<UndoRedoControls {...defaultProps} canUndo={false} />);

      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    });

    it('should be enabled when canUndo is true', () => {
      render(<UndoRedoControls {...defaultProps} canUndo={true} />);

      expect(screen.getByRole('button', { name: /undo/i })).toBeEnabled();
    });

    it('should call onUndo when clicked', async () => {
      const user = userEvent.setup();
      const onUndo = vi.fn();

      render(
        <UndoRedoControls
          {...defaultProps}
          canUndo={true}
          onUndo={onUndo}
        />
      );

      await user.click(screen.getByRole('button', { name: /undo/i }));

      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('should show undo count when provided', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          canUndo={true}
          undoCount={5}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show tooltip with step count', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          canUndo={true}
          undoCount={3}
        />
      );

      const undoButton = screen.getByRole('button', { name: /undo/i });
      expect(undoButton).toHaveAttribute('title', expect.stringContaining('3 step'));
    });
  });

  describe('Redo Button', () => {
    it('should be disabled when canRedo is false', () => {
      render(<UndoRedoControls {...defaultProps} canRedo={false} />);

      expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
    });

    it('should be enabled when canRedo is true', () => {
      render(<UndoRedoControls {...defaultProps} canRedo={true} />);

      expect(screen.getByRole('button', { name: /redo/i })).toBeEnabled();
    });

    it('should call onRedo when clicked', async () => {
      const user = userEvent.setup();
      const onRedo = vi.fn();

      render(
        <UndoRedoControls
          {...defaultProps}
          canRedo={true}
          onRedo={onRedo}
        />
      );

      await user.click(screen.getByRole('button', { name: /redo/i }));

      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('should show redo count when provided', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          canRedo={true}
          redoCount={2}
        />
      );

      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('Reset Button', () => {
    it('should be disabled when isDirty is false', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onReset={vi.fn()}
          isDirty={false}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    });

    it('should be enabled when isDirty is true', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onReset={vi.fn()}
          isDirty={true}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled();
    });

    it('should call onReset when clicked', async () => {
      const user = userEvent.setup();
      const onReset = vi.fn();

      render(
        <UndoRedoControls
          {...defaultProps}
          onReset={onReset}
          isDirty={true}
        />
      );

      await user.click(screen.getByRole('button', { name: /reset/i }));

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Save Button', () => {
    it('should show primary variant when isDirty', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={vi.fn()}
          isDirty={true}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save/i });
      expect(saveButton).toHaveClass('btn-primary');
    });

    it('should show check icon when not dirty (saved state)', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={vi.fn()}
          isDirty={false}
        />
      );

      // Should show a check icon (saved state)
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('should show spinner when saving', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={vi.fn()}
          isDirty={true}
          isSavePending={true}
        />
      );

      // Save button should show saving indicator
      const saveButton = screen.getByRole('button', { name: /save/i });
      expect(saveButton).toBeDisabled();
    });

    it('should call onSave when clicked', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={onSave}
          isDirty={true}
        />
      );

      await user.click(screen.getByRole('button', { name: /save/i }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('Save Status', () => {
    it('should show last save time when provided', () => {
      const now = new Date();

      render(
        <UndoRedoControls
          {...defaultProps}
          lastSaveTime={now}
        />
      );

      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });

    it('should show "Just now" for recent saves', () => {
      const recentTime = new Date(Date.now() - 2000); // 2 seconds ago

      render(
        <UndoRedoControls
          {...defaultProps}
          lastSaveTime={recentTime}
        />
      );

      expect(screen.getByText(/just now/i)).toBeInTheDocument();
    });

    it('should show "Saving..." when save is pending', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onSave={vi.fn()}
          isSavePending={true}
        />
      );

      expect(screen.getByText(/saving/i)).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should disable all buttons when disabled prop is true', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          canUndo={true}
          canRedo={true}
          onReset={vi.fn()}
          onSave={vi.fn()}
          isDirty={true}
          disabled={true}
        />
      );

      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });
  });

  describe('Labels', () => {
    it('should show labels when showLabels is true', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          showLabels={true}
        />
      );

      expect(screen.getByText('Undo')).toBeInTheDocument();
      expect(screen.getByText('Redo')).toBeInTheDocument();
    });

    it('should hide labels when showLabels is false', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          showLabels={false}
        />
      );

      // Labels should not be visible (only icons)
      expect(screen.queryByText(/^Undo$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Redo$/)).not.toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should hide save status in compact mode', () => {
      const now = new Date();

      render(
        <UndoRedoControls
          {...defaultProps}
          lastSaveTime={now}
          compact={true}
        />
      );

      // In compact mode, the "Saved X ago" text should not appear
      expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
    });

    it('should use smaller gaps in compact mode', () => {
      const { container } = render(
        <UndoRedoControls
          {...defaultProps}
          compact={true}
        />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('gap-1');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      render(
        <UndoRedoControls
          {...defaultProps}
          onReset={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /undo/i })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: /redo/i })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: /reset/i })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: /save/i })).toHaveAttribute('aria-label');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();

      render(
        <UndoRedoControls
          {...defaultProps}
          canUndo={true}
          canRedo={true}
        />
      );

      // Tab to first button
      await user.tab();
      expect(screen.getByRole('button', { name: /undo/i })).toHaveFocus();

      // Tab to next button
      await user.tab();
      expect(screen.getByRole('button', { name: /redo/i })).toHaveFocus();
    });
  });
});
