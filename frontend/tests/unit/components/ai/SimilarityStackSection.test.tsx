/**
 * SimilarityStackSection Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Toggle interactions
 * - Threshold preset selection
 * - Best shots toggle
 * - Accessibility
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimilarityStackSection } from '../../../../src/components/features/ai/SimilarityStackSection';

describe('SimilarityStackSection', () => {
  describe('Rendering', () => {
    it('renders the section with legend', () => {
      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('Similar Photo Organization')).toBeInTheDocument();
      // Text appears in heading and toggle aria-label, so use getAllByText
      expect(screen.getAllByText(/hide similar photos/i).length).toBeGreaterThan(0);
    });

    it('shows similarity groups count badge when provided', () => {
      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          similarityGroupsCount={15}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('15 groups')).toBeInTheDocument();
    });

    it('shows helper text when disabled', () => {
      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/enable.*hide similar photos/i)).toBeInTheDocument();
    });
  });

  describe('Main Toggle Interaction', () => {
    it('calls onChange when toggling hide similar', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={onChange}
        />
      );

      const toggle = screen.getByRole('switch', { name: /hide similar photos/i });
      await user.click(toggle);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ hideSimilar: true })
      );
    });

    it('resets showOnlyBestShots when disabling hideSimilar', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={true}
          onChange={onChange}
        />
      );

      const toggle = screen.getByRole('switch', { name: /hide similar photos/i });
      await user.click(toggle);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hideSimilar: false,
          showOnlyBestShots: false,
        })
      );
    });
  });

  describe('Threshold Controls', () => {
    it('shows threshold presets when enabled', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByRole('radio', { name: /near-duplicates/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /very similar/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /^similar$/i })).toBeInTheDocument();
    });

    it('calls onChange when selecting threshold preset', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={onChange}
        />
      );

      await user.click(screen.getByRole('radio', { name: /near-duplicates/i }));

      expect(onChange).toHaveBeenCalledWith({ similarityThreshold: 0.95 });
    });

    it('shows slider for custom threshold', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      const slider = screen.getByRole('slider', { name: /similarity threshold/i });
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveValue('0.75');
    });

    it('calls onChange when moving slider', () => {
      const onChange = vi.fn();

      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={onChange}
        />
      );

      const slider = screen.getByRole('slider', { name: /similarity threshold/i });
      fireEvent.change(slider, { target: { value: '0.85' } });

      expect(onChange).toHaveBeenCalledWith({ similarityThreshold: 0.85 });
    });

    it('displays threshold percentage', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.8}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('80%')).toBeInTheDocument();
    });
  });

  describe('Best Shots Toggle', () => {
    it('shows best shots toggle when enabled', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/show only best shots/i)).toBeInTheDocument();
    });

    it('hides best shots toggle when disabled', () => {
      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.queryByText(/show only best shots/i)).not.toBeInTheDocument();
    });

    it('calls onChange when toggling best shots', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={onChange}
        />
      );

      const toggle = screen.getByRole('switch', { name: /show only best shots/i });
      await user.click(toggle);

      expect(onChange).toHaveBeenCalledWith({ showOnlyBestShots: true });
    });
  });

  describe('Threshold Descriptions', () => {
    it('shows appropriate description for high threshold', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.95}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/nearly identical/i)).toBeInTheDocument();
    });

    it('shows appropriate description for medium threshold', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/moderately similar/i)).toBeInTheDocument();
    });

    it('shows appropriate description for low threshold', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.55}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/loosely similar/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible fieldset with legend', () => {
      render(
        <SimilarityStackSection
          hideSimilar={false}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toBeInTheDocument();
    });

    it('threshold presets have radio role', () => {
      render(
        <SimilarityStackSection
          hideSimilar={true}
          similarityThreshold={0.75}
          showOnlyBestShots={false}
          onChange={vi.fn()}
        />
      );

      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(3);
    });
  });
});
