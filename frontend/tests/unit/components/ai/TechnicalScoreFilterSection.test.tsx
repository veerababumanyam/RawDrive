/**
 * TechnicalScoreFilterSection Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Score input rendering and interactions
 * - Value validation (0-100 range)
 * - Accessibility (labels, descriptions, keyboard)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TechnicalScoreFilterSection } from '../../../../src/components/features/ai/TechnicalScoreFilterSection';

describe('TechnicalScoreFilterSection', () => {
  describe('Rendering', () => {
    it('renders all three score inputs', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('Sharpness')).toBeInTheDocument();
      expect(screen.getByText('Exposure')).toBeInTheDocument();
      expect(screen.getByText('Composition')).toBeInTheDocument();
    });

    it('renders fieldset with legend', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByRole('group', { name: /technical score filters/i })).toBeInTheDocument();
      expect(screen.getByText('Technical Scores')).toBeInTheDocument();
    });

    it('displays provided values in inputs', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={75}
          minExposure={80}
          minComposition={85}
          onChange={vi.fn()}
        />
      );

      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[0]).toHaveValue(75);
      expect(inputs[1]).toHaveValue(80);
      expect(inputs[2]).toHaveValue(85);
    });
  });

  describe('Interactions', () => {
    it('calls onChange with sharpness value', () => {
      const onChange = vi.fn();
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={onChange}
        />
      );

      const sharpnessInput = screen.getByLabelText('Sharpness');
      fireEvent.change(sharpnessInput, { target: { value: '70' } });

      expect(onChange).toHaveBeenCalledWith({ minSharpness: 70 });
    });

    it('calls onChange with exposure value', () => {
      const onChange = vi.fn();
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={onChange}
        />
      );

      const exposureInput = screen.getByLabelText('Exposure');
      fireEvent.change(exposureInput, { target: { value: '60' } });
      expect(onChange).toHaveBeenCalledWith({ minExposure: 60 });
    });

    it('calls onChange with composition value', () => {
      const onChange = vi.fn();
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={onChange}
        />
      );

      const compositionInput = screen.getByLabelText('Composition');
      fireEvent.change(compositionInput, { target: { value: '55' } });
      expect(onChange).toHaveBeenCalledWith({ minComposition: 55 });
    });

    it('handles empty input by setting undefined', () => {
      const onChange = vi.fn();
      render(
        <TechnicalScoreFilterSection
          minSharpness={75}
          minExposure={undefined}
          minComposition={undefined}
          onChange={onChange}
        />
      );

      const sharpnessInput = screen.getByLabelText('Sharpness');
      fireEvent.change(sharpnessInput, { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith({ minSharpness: undefined });
    });
  });

  describe('Value Validation', () => {
    it('has min=0 and max=100 attributes on inputs', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      const inputs = screen.getAllByRole('spinbutton');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('min', '0');
        expect(input).toHaveAttribute('max', '100');
      });
    });

    it('has step=1 for integer values', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      const inputs = screen.getAllByRole('spinbutton');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('step', '1');
      });
    });
  });

  describe('Accessibility', () => {
    it('has aria-describedby linking to descriptions', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      const sharpnessInput = screen.getByLabelText('Sharpness');
      const describedById = sharpnessInput.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();

      // The description should exist in the DOM
      const description = document.getElementById(describedById!);
      expect(description).toBeInTheDocument();
      expect(description?.textContent).toMatch(/sharpness score/i);
    });

    it('provides help text about the range', () => {
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/0-100/i)).toBeInTheDocument();
    });

    it('supports keyboard navigation through inputs', async () => {
      const user = userEvent.setup();
      render(
        <TechnicalScoreFilterSection
          minSharpness={undefined}
          minExposure={undefined}
          minComposition={undefined}
          onChange={vi.fn()}
        />
      );

      const inputs = screen.getAllByRole('spinbutton');

      // Tab through inputs
      await user.tab();
      expect(inputs[0]).toHaveFocus();

      await user.tab();
      expect(inputs[1]).toHaveFocus();

      await user.tab();
      expect(inputs[2]).toHaveFocus();
    });
  });
});
