/**
 * FavoritesButton Component Tests
 *
 * Tests for the favorites toggle button component.
 * Tests rendering, count display, and accessibility.
 *
 * Feature: 012-client-favorites
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FavoritesButton } from '../FavoritesButton';

describe('FavoritesButton', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with heart icon', () => {
      render(<FavoritesButton count={0} onClick={mockOnClick} />);

      // Button should be in the document
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should not show count when count is 0', () => {
      render(<FavoritesButton count={0} onClick={mockOnClick} />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should show count when count is greater than 0', () => {
      render(<FavoritesButton count={5} onClick={mockOnClick} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show 99+ when count exceeds 99', () => {
      render(<FavoritesButton count={150} onClick={mockOnClick} />);

      expect(screen.getByText('99+')).toBeInTheDocument();
      expect(screen.queryByText('150')).not.toBeInTheDocument();
    });

    it('should show notification dot when count > 0 and not active', () => {
      const { container } = render(
        <FavoritesButton count={3} isActive={false} onClick={mockOnClick} />
      );

      // Notification dot has animate-pulse class
      const notificationDot = container.querySelector('.animate-pulse');
      expect(notificationDot).toBeInTheDocument();
    });

    it('should not show notification dot when active', () => {
      const { container } = render(
        <FavoritesButton count={3} isActive={true} onClick={mockOnClick} />
      );

      // Notification dot should not be present when active
      const notificationDot = container.querySelector('.animate-pulse');
      expect(notificationDot).not.toBeInTheDocument();
    });

    it('should not show notification dot when count is 0', () => {
      const { container } = render(
        <FavoritesButton count={0} isActive={false} onClick={mockOnClick} />
      );

      const notificationDot = container.querySelector('.animate-pulse');
      expect(notificationDot).not.toBeInTheDocument();
    });
  });

  describe('Active State', () => {
    it('should apply active styles when isActive is true', () => {
      render(<FavoritesButton count={5} isActive={true} onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-error');
    });

    it('should apply inactive styles when isActive is false', () => {
      render(<FavoritesButton count={5} isActive={false} onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-text-secondary');
    });

    it('should set aria-pressed based on isActive', () => {
      const { rerender } = render(
        <FavoritesButton count={5} isActive={false} onClick={mockOnClick} />
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <FavoritesButton count={5} isActive={true} onClick={mockOnClick} />
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Interactions', () => {
    it('should call onClick when clicked', async () => {
      render(<FavoritesButton count={5} onClick={mockOnClick} />);

      await userEvent.click(screen.getByRole('button'));

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick on Enter key press', async () => {
      render(<FavoritesButton count={5} onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      button.focus();
      await userEvent.keyboard('{Enter}');

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick on Space key press', async () => {
      render(<FavoritesButton count={5} onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      button.focus();
      await userEvent.keyboard(' ');

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible aria-label with count', () => {
      render(<FavoritesButton count={10} onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'View favorites (10 items)');
    });

    it('should update aria-label when count changes', () => {
      const { rerender } = render(
        <FavoritesButton count={5} onClick={mockOnClick} />
      );

      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'View favorites (5 items)'
      );

      rerender(<FavoritesButton count={20} onClick={mockOnClick} />);

      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'View favorites (20 items)'
      );
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      render(
        <FavoritesButton
          count={5}
          onClick={mockOnClick}
          className="custom-class"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });
});
