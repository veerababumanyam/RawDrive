/**
 * ContentFilterSection Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Tag rendering and filtering
 * - Tag toggle interactions (include/exclude/clear cycle)
 * - Face filter controls
 * - Accessibility
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentFilterSection } from '../../../../src/components/features/ai/ContentFilterSection';
import type { TagOption } from '../../../../src/types/aiFilter';

const mockTags: TagOption[] = [
  { tag_id: '1', name: 'wedding', type: 'event', usage_count: 50 },
  { tag_id: '2', name: 'portrait', type: 'style', usage_count: 30 },
  { tag_id: '3', name: 'outdoor', type: 'setting', usage_count: 25 },
  { tag_id: '4', name: 'candid', type: 'style', usage_count: 20 },
];

describe('ContentFilterSection', () => {
  describe('Tag Rendering', () => {
    it('renders available tags grouped by type', () => {
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('wedding')).toBeInTheDocument();
      expect(screen.getByText('portrait')).toBeInTheDocument();
      expect(screen.getByText('outdoor')).toBeInTheDocument();
      expect(screen.getByText('candid')).toBeInTheDocument();

      // Type headings
      expect(screen.getByText('event')).toBeInTheDocument();
      expect(screen.getByText('style')).toBeInTheDocument();
      expect(screen.getByText('setting')).toBeInTheDocument();
    });

    it('shows empty state when no tags available', () => {
      render(
        <ContentFilterSection
          availableTags={[]}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/no tags available/i)).toBeInTheDocument();
    });

    it('shows loading state', () => {
      render(
        <ContentFilterSection
          availableTags={[]}
          includeTags={[]}
          excludeTags={[]}
          isLoading
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText(/loading tags/i)).toBeInTheDocument();
    });
  });

  describe('Tag Search', () => {
    it('filters tags by search input', async () => {
      const user = userEvent.setup();
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search tags/i);
      await user.type(searchInput, 'wed');

      expect(screen.getByText('wedding')).toBeInTheDocument();
      expect(screen.queryByText('portrait')).not.toBeInTheDocument();
    });

    it('shows no results message when search matches nothing', async () => {
      const user = userEvent.setup();
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search tags/i);
      await user.type(searchInput, 'xyz123');

      expect(screen.getByText(/no tags match/i)).toBeInTheDocument();
    });
  });

  describe('Tag Toggle Interactions', () => {
    it('cycles tag state: none -> include -> exclude -> none', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      const { rerender } = render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={onChange}
        />
      );

      const weddingTag = screen.getByRole('button', { name: /wedding/i });

      // First click: include
      await user.click(weddingTag);
      expect(onChange).toHaveBeenCalledWith({
        includeTags: ['wedding'],
        excludeTags: [],
      });

      // Rerender with tag included
      rerender(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={['wedding']}
          excludeTags={[]}
          onChange={onChange}
        />
      );

      // Second click: exclude
      await user.click(weddingTag);
      expect(onChange).toHaveBeenLastCalledWith({
        includeTags: [],
        excludeTags: ['wedding'],
      });

      // Rerender with tag excluded
      rerender(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={['wedding']}
          onChange={onChange}
        />
      );

      // Third click: clear
      await user.click(weddingTag);
      expect(onChange).toHaveBeenLastCalledWith({
        includeTags: [],
        excludeTags: [],
      });
    });

    it('shows active filter summary with remove buttons', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={['wedding']}
          excludeTags={['portrait']}
          onChange={onChange}
        />
      );

      // Summary badges should appear (text appears in summary and tag chips)
      const weddingElements = screen.getAllByText('wedding');
      const summarySection = weddingElements[0].closest('span');
      expect(summarySection).toHaveClass('bg-green-100');

      const portraitElements = screen.getAllByText('portrait');
      const excludeBadge = portraitElements[0].closest('span');
      expect(excludeBadge).toHaveClass('bg-red-100');

      // Click remove button on included tag
      const removeButtons = screen.getAllByRole('button', { name: /remove wedding/i });
      await user.click(removeButtons[0]);

      expect(onChange).toHaveBeenCalledWith({
        includeTags: [],
        excludeTags: ['portrait'],
      });
    });
  });

  describe('Face Filter Controls', () => {
    it('renders face presence toggle buttons', () => {
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /all photos/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /with people/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /without people/i })).toBeInTheDocument();
    });

    it('calls onChange when face filter is toggled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={onChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /with people/i }));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ hasFaces: true })
      );
    });

    it('shows face count inputs when "With People" is selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      const { rerender } = render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={onChange}
        />
      );

      // Face count inputs should not be visible initially
      expect(screen.queryByLabelText(/minimum number of people/i)).not.toBeInTheDocument();

      // Click "With People"
      await user.click(screen.getByRole('button', { name: /with people/i }));

      // Rerender with hasFaces=true
      rerender(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          hasFaces={true}
          onChange={onChange}
        />
      );

      // Face count inputs should now be visible
      expect(screen.getByLabelText(/minimum number of people/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/maximum number of people/i)).toBeInTheDocument();
    });

    it('calls onChange with face count values', async () => {
      const onChange = vi.fn();

      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          hasFaces={true}
          onChange={onChange}
        />
      );

      const minInput = screen.getByLabelText(/minimum number of people/i);
      fireEvent.change(minInput, { target: { value: '2' } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ minFaces: 2 })
      );
    });
  });

  describe('Accessibility', () => {
    it('has accessible fieldset with legend', () => {
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={[]}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      expect(screen.getByText('Content Tags')).toBeInTheDocument();
      expect(screen.getByText('People Filter')).toBeInTheDocument();
    });

    it('tag buttons have descriptive aria-labels', () => {
      render(
        <ContentFilterSection
          availableTags={mockTags}
          includeTags={['wedding']}
          excludeTags={[]}
          onChange={vi.fn()}
        />
      );

      const weddingTag = screen.getByRole('button', { name: /wedding.*must have/i });
      expect(weddingTag).toBeInTheDocument();
    });
  });
});
