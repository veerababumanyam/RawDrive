/**
 * BlurFilterSection Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Checkbox interactions
 * - Disabled state for bokeh checkbox
 * - Accessibility (labels, descriptions, keyboard)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlurFilterSection } from '../../../../src/components/features/ai/BlurFilterSection';

describe('BlurFilterSection', () => {
  describe('Rendering', () => {
    it('renders both checkboxes with labels', () => {
      const onChange = vi.fn();
      render(
        <BlurFilterSection
          blurHide={false}
          blurShowBokeh={true}
          onChange={onChange}
        />
      );

      expect(screen.getByText(/hide blurry photos/i)).toBeInTheDocument();
      expect(screen.getByText(/show artistic bokeh/i)).toBeInTheDocument();
    });

    it('renders fieldset with legend', () => {
      render(
        <BlurFilterSection
          blurHide={false}
          blurShowBokeh={true}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(screen.getByText('Blur Filter')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onChange when hide blurry is toggled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <BlurFilterSection
          blurHide={false}
          blurShowBokeh={true}
          onChange={onChange}
        />
      );

      const hideCheckbox = screen.getByLabelText(/hide blurry photos/i);
      await user.click(hideCheckbox);
      expect(onChange).toHaveBeenCalledWith({ blurHide: true });
    });

    it('calls onChange when show bokeh is toggled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <BlurFilterSection
          blurHide={true}
          blurShowBokeh={true}
          onChange={onChange}
        />
      );

      const bokehCheckbox = screen.getByLabelText(/show artistic bokeh/i);
      await user.click(bokehCheckbox);
      expect(onChange).toHaveBeenCalledWith({ blurShowBokeh: false });
    });
  });

  describe('Disabled State', () => {
    it('disables bokeh checkbox when blurHide is false', () => {
      render(
        <BlurFilterSection
          blurHide={false}
          blurShowBokeh={true}
          onChange={vi.fn()}
        />
      );

      const bokehCheckbox = screen.getByLabelText(/show artistic bokeh/i);
      expect(bokehCheckbox).toBeDisabled();
    });

    it('enables bokeh checkbox when blurHide is true', () => {
      render(
        <BlurFilterSection
          blurHide={true}
          blurShowBokeh={true}
          onChange={vi.fn()}
        />
      );

      const bokehCheckbox = screen.getByLabelText(/show artistic bokeh/i);
      expect(bokehCheckbox).not.toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible descriptions for checkboxes', () => {
      render(
        <BlurFilterSection
          blurHide={false}
          blurShowBokeh={true}
          onChange={vi.fn()}
        />
      );

      // Check that descriptions exist (they're connected via aria-describedby)
      expect(screen.getByText(/hides photos detected as out of focus/i)).toBeInTheDocument();
      expect(screen.getByText(/keep photos with intentional background blur/i)).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <BlurFilterSection
          blurHide={true}
          blurShowBokeh={true}
          onChange={onChange}
        />
      );

      const hideCheckbox = screen.getByLabelText(/hide blurry photos/i);
      const bokehCheckbox = screen.getByLabelText(/show artistic bokeh/i);

      // Tab to first checkbox
      await user.tab();
      expect(hideCheckbox).toHaveFocus();

      // Space to toggle
      await user.keyboard(' ');
      expect(onChange).toHaveBeenCalledWith({ blurHide: false });

      // Tab to second checkbox
      await user.tab();
      expect(bokehCheckbox).toHaveFocus();
    });
  });
});
