/**
 * SmartCollectionSelector Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Preset rendering and selection
 * - Keyboard navigation (arrow keys, Enter, Space, Home, End)
 * - ARIA listbox pattern compliance
 * - Accessibility attributes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmartCollectionSelector } from '../../../../src/components/features/ai/SmartCollectionSelector';
import { aiFilterService } from '../../../../src/services/aiFilterService';
import type { CurationPreset } from '../../../../src/types/aiFilter';

// Mock useAuth hook
vi.mock('../../../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { user_id: 'test-user', email: 'test@example.com' },
    workspace: { workspace_id: 'test-workspace', name: 'Test Workspace' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock the aiFilterService
vi.mock('../../../../src/services/aiFilterService', () => ({
  aiFilterService: {
    getPresets: vi.fn(),
  },
}));

const mockPresets: CurationPreset[] = [
  { preset_id: 'highlights', name: 'Highlights', description: 'Best quality shots', filters: {} },
  { preset_id: 'portraits', name: 'Portraits', description: 'Photos with faces', filters: {} },
  { preset_id: 'events', name: 'Event Coverage', description: 'Key moments', filters: {} },
];

describe('SmartCollectionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (aiFilterService.getPresets as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresets);
  });

  describe('Rendering', () => {
    it('renders all presets as options', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Highlights')).toBeInTheDocument();
      });
      expect(screen.getByText('Portraits')).toBeInTheDocument();
      expect(screen.getByText('Event Coverage')).toBeInTheDocument();
    });

    it('renders with listbox role', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('renders preset descriptions', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Best quality shots')).toBeInTheDocument();
      });
      expect(screen.getByText('Photos with faces')).toBeInTheDocument();
    });

    it('shows selected state for active preset', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId="highlights"
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        const selectedOption = screen.getByRole('option', { name: /highlights/i });
        expect(selectedOption).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('shows loading state initially', () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows error state on fetch failure', async () => {
      (aiFilterService.getPresets as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Click Interactions', () => {
    it('calls onSelect when clicking a preset', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={onSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Portraits')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Portraits'));
      expect(onSelect).toHaveBeenCalledWith(mockPresets[1]);
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates with ArrowDown key', async () => {
      const user = userEvent.setup();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const firstOption = screen.getByRole('option', { name: /highlights/i });
      await user.click(firstOption);
      await user.keyboard('{ArrowDown}');

      // Second option should now be focused
      const secondOption = screen.getByRole('option', { name: /portraits/i });
      expect(document.activeElement).toBe(secondOption);
    });

    it('selects with Enter key', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={onSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const firstOption = screen.getByRole('option', { name: /highlights/i });
      await user.click(firstOption);
      await user.keyboard('{Enter}');

      expect(onSelect).toHaveBeenCalledWith(mockPresets[0]);
    });

    it('selects with Space key', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={onSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const firstOption = screen.getByRole('option', { name: /highlights/i });
      await user.click(firstOption);
      await user.keyboard(' ');

      expect(onSelect).toHaveBeenCalledWith(mockPresets[0]);
    });

    it('navigates to last item with End key', async () => {
      const user = userEvent.setup();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const firstOption = screen.getByRole('option', { name: /highlights/i });
      await user.click(firstOption);
      await user.keyboard('{End}');

      const lastOption = screen.getByRole('option', { name: /event coverage/i });
      expect(document.activeElement).toBe(lastOption);
    });

    it('navigates to first item with Home key', async () => {
      const user = userEvent.setup();
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const lastOption = screen.getByRole('option', { name: /event coverage/i });
      await user.click(lastOption);
      await user.keyboard('{Home}');

      const firstOption = screen.getByRole('option', { name: /highlights/i });
      expect(document.activeElement).toBe(firstOption);
    });
  });

  describe('ARIA Compliance', () => {
    it('has role="listbox" on container', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('has role="option" on each preset', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(3);
      });
    });

    it('has aria-selected on options', async () => {
      render(
        <SmartCollectionSelector
          selectedPresetId="portraits"
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        const selectedOption = screen.getByRole('option', { name: /portraits/i });
        expect(selectedOption).toHaveAttribute('aria-selected', 'true');
      });

      const unselectedOption = screen.getByRole('option', { name: /highlights/i });
      expect(unselectedOption).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Empty State', () => {
    it('renders empty message when no presets', async () => {
      (aiFilterService.getPresets as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      render(
        <SmartCollectionSelector
          selectedPresetId={undefined}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/no presets available/i)).toBeInTheDocument();
      });
    });
  });
});
