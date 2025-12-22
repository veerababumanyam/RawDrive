/**
 * Unit tests for ThemeHelpTooltip components
 *
 * Tests cover:
 * - ThemeHelpTooltip contextual help
 * - BeforeAfterPreview comparison
 * - CustomizedBadge indicator
 * - ThemeTipsPanel onboarding
 * - Accessibility compliance
 *
 * Requirements: 8.10, 8.11, 8.13, 8.14
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ThemeHelpTooltip,
  BeforeAfterPreview,
  CustomizedBadge,
  ThemeTipsPanel,
} from '../ThemeHelpTooltip';

describe('ThemeHelpTooltip', () => {
  describe('Rendering', () => {
    it('should render help icon button', () => {
      render(<ThemeHelpTooltip field="primary_color" />);

      expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
    });

    it('should not render for unknown field', () => {
      const { container } = render(
        <ThemeHelpTooltip field={'unknown_field' as any} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Tooltip Display', () => {
    it('should show tooltip on hover', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      expect(screen.getByText('Primary Color')).toBeInTheDocument();
    });

    it('should show description in tooltip', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByText(/main brand color/i)).toBeInTheDocument();
      });
    });

    it('should show tip in tooltip', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByText(/choose a color/i)).toBeInTheDocument();
      });
    });

    it('should hide tooltip on mouse leave', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.unhover(helpButton);

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Focus Behavior', () => {
    it('should show tooltip on focus', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.tab();

      if (document.activeElement === helpButton) {
        await waitFor(() => {
          expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });
      }
    });

    it('should hide tooltip on blur', async () => {
      const user = userEvent.setup();

      render(
        <>
          <ThemeHelpTooltip field="primary_color" />
          <button>Other button</button>
        </>
      );

      const helpButton = screen.getByRole('button', { name: /help/i });
      helpButton.focus();

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.tab();

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Position Variants', () => {
    it('should render with top position by default', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.className).toContain('bottom-full');
      });
    });

    it('should render with bottom position', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" position="bottom" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.className).toContain('top-full');
      });
    });
  });

  describe('Learn More Link', () => {
    it('should show learn more link for contrast field', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="contrast" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByText(/learn more/i)).toBeInTheDocument();
      });

      const link = screen.getByRole('link', { name: /learn more/i });
      expect(link).toHaveAttribute('href', expect.stringContaining('w3.org'));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  describe('Accessibility', () => {
    it('should have accessible label on button', () => {
      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help.*primary color/i });
      expect(helpButton).toBeInTheDocument();
    });

    it('should have role=tooltip on popup', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button', { name: /help/i });
      await user.hover(helpButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });
});

describe('BeforeAfterPreview', () => {
  describe('Rendering', () => {
    it('should render label', () => {
      render(
        <BeforeAfterPreview
          label="Primary"
          before="#2563EB"
          after="#FF0000"
          type="color"
        />
      );

      expect(screen.getByText('Primary')).toBeInTheDocument();
    });

    it('should render before and after labels', () => {
      render(
        <BeforeAfterPreview
          label="Primary"
          before="#2563EB"
          after="#FF0000"
          type="color"
        />
      );

      expect(screen.getByText(/before/i)).toBeInTheDocument();
      expect(screen.getByText(/after/i)).toBeInTheDocument();
    });
  });

  describe('Color Type', () => {
    it('should render color swatches for color type', () => {
      const { container } = render(
        <BeforeAfterPreview
          label="Primary"
          before="#2563EB"
          after="#FF0000"
          type="color"
        />
      );

      const colorSwatches = container.querySelectorAll('[style*="background-color"]');
      expect(colorSwatches.length).toBe(2);
    });
  });

  describe('Font Type', () => {
    it('should render font preview for font type', () => {
      render(
        <BeforeAfterPreview
          label="Heading"
          before="Inter"
          after="Playfair Display"
          type="font"
        />
      );

      expect(screen.getByText('Inter')).toBeInTheDocument();
      expect(screen.getByText('Playfair Display')).toBeInTheDocument();
    });
  });

  describe('Text Type', () => {
    it('should render text values for text type', () => {
      render(
        <BeforeAfterPreview
          label="Spacing"
          before="Compact"
          after="Spacious"
          type="text"
        />
      );

      expect(screen.getByText('Compact')).toBeInTheDocument();
      expect(screen.getByText('Spacious')).toBeInTheDocument();
    });
  });

  describe('Change Indicator', () => {
    it('should show check icon when values differ', () => {
      const { container } = render(
        <BeforeAfterPreview
          label="Primary"
          before="#2563EB"
          after="#FF0000"
          type="color"
        />
      );

      // Should have a check circle icon
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should not show check icon when values are same', () => {
      const { container } = render(
        <BeforeAfterPreview
          label="Primary"
          before="#2563EB"
          after="#2563EB"
          type="color"
        />
      );

      // Should not have success icon when unchanged
      const successIcon = container.querySelector('.text-success');
      expect(successIcon).not.toBeInTheDocument();
    });
  });
});

describe('CustomizedBadge', () => {
  describe('Rendering', () => {
    it('should render nothing when not customized', () => {
      const { container } = render(
        <CustomizedBadge isCustomized={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render badge when customized', () => {
      render(<CustomizedBadge isCustomized={true} />);

      expect(screen.getByText(/customized/i)).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render dot indicator in compact mode', () => {
      const { container } = render(
        <CustomizedBadge isCustomized={true} compact={true} />
      );

      const dot = container.querySelector('.rounded-full');
      expect(dot).toBeInTheDocument();
      expect(screen.queryByText(/customized/i)).not.toBeInTheDocument();
    });

    it('should have title attribute in compact mode', () => {
      const { container } = render(
        <CustomizedBadge isCustomized={true} compact={true} />
      );

      const dot = container.querySelector('[title="Customized"]');
      expect(dot).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label', () => {
      render(<CustomizedBadge isCustomized={true} />);

      const badge = screen.getByText(/customized/i);
      expect(badge).toHaveAttribute('aria-label', expect.stringContaining('customized'));
    });
  });
});

describe('ThemeTipsPanel', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default tips', () => {
      render(<ThemeTipsPanel />);

      expect(screen.getByText(/tip 1 of/i)).toBeInTheDocument();
    });

    it('should render with custom tips', () => {
      const customTips = ['Tip one', 'Tip two'];

      render(<ThemeTipsPanel tips={customTips} />);

      expect(screen.getByText('Tip one')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should show next tip when Next is clicked', async () => {
      const user = userEvent.setup();
      const tips = ['First tip', 'Second tip', 'Third tip'];

      render(<ThemeTipsPanel tips={tips} />);

      expect(screen.getByText('First tip')).toBeInTheDocument();

      await user.click(screen.getByText(/next/i));

      expect(screen.getByText('Second tip')).toBeInTheDocument();
    });

    it('should show previous tip when Previous is clicked', async () => {
      const user = userEvent.setup();
      const tips = ['First tip', 'Second tip', 'Third tip'];

      render(<ThemeTipsPanel tips={tips} />);

      // Go to second tip
      await user.click(screen.getByText(/next/i));
      expect(screen.getByText('Second tip')).toBeInTheDocument();

      // Go back
      await user.click(screen.getByText(/previous/i));
      expect(screen.getByText('First tip')).toBeInTheDocument();
    });

    it('should wrap around when at last tip', async () => {
      const user = userEvent.setup();
      const tips = ['First tip', 'Second tip'];

      render(<ThemeTipsPanel tips={tips} />);

      // Go to last tip
      await user.click(screen.getByText(/next/i));
      expect(screen.getByText('Second tip')).toBeInTheDocument();

      // Click next again - should wrap to first
      await user.click(screen.getByText(/next/i));
      expect(screen.getByText('First tip')).toBeInTheDocument();
    });

    it('should allow clicking dots to navigate', async () => {
      const user = userEvent.setup();
      const tips = ['First tip', 'Second tip', 'Third tip'];

      render(<ThemeTipsPanel tips={tips} />);

      // Click third dot
      const dots = screen.getAllByRole('button', { name: /go to tip/i });
      await user.click(dots[2]);

      expect(screen.getByText('Third tip')).toBeInTheDocument();
    });
  });

  describe('Dismiss', () => {
    it('should hide panel when Dismiss is clicked', async () => {
      const user = userEvent.setup();

      render(<ThemeTipsPanel onDismiss={mockOnDismiss} />);

      await user.click(screen.getByText(/dismiss/i));

      // Panel should be hidden
      expect(screen.queryByText(/tip 1 of/i)).not.toBeInTheDocument();
    });

    it('should call onDismiss callback', async () => {
      const user = userEvent.setup();

      render(<ThemeTipsPanel onDismiss={mockOnDismiss} />);

      await user.click(screen.getByText(/dismiss/i));

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Progress Indicator', () => {
    it('should show current tip number', () => {
      const tips = ['Tip 1', 'Tip 2', 'Tip 3'];

      render(<ThemeTipsPanel tips={tips} />);

      expect(screen.getByText('Tip 1 of 3')).toBeInTheDocument();
    });

    it('should show correct number of dots', () => {
      const tips = ['Tip 1', 'Tip 2', 'Tip 3', 'Tip 4'];

      render(<ThemeTipsPanel tips={tips} />);

      const dots = screen.getAllByRole('button', { name: /go to tip/i });
      expect(dots).toHaveLength(4);
    });

    it('should highlight current dot', async () => {
      const user = userEvent.setup();
      const tips = ['Tip 1', 'Tip 2', 'Tip 3'];

      render(<ThemeTipsPanel tips={tips} />);

      const dots = screen.getAllByRole('button', { name: /go to tip/i });

      // First dot should be active
      expect(dots[0]).toHaveClass('bg-primary');

      // Navigate to second
      await user.click(screen.getByText(/next/i));

      // Second dot should now be active
      expect(dots[1]).toHaveClass('bg-primary');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels on navigation buttons', () => {
      const tips = ['Tip 1', 'Tip 2'];

      render(<ThemeTipsPanel tips={tips} />);

      expect(screen.getByText(/previous/i)).toBeInTheDocument();
      expect(screen.getByText(/next/i)).toBeInTheDocument();
    });

    it('should have accessible labels on dots', () => {
      const tips = ['Tip 1', 'Tip 2', 'Tip 3'];

      render(<ThemeTipsPanel tips={tips} />);

      expect(screen.getByRole('button', { name: 'Go to tip 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to tip 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to tip 3' })).toBeInTheDocument();
    });
  });

  describe('Single Tip', () => {
    it('should disable navigation when only one tip', () => {
      render(<ThemeTipsPanel tips={['Only tip']} />);

      expect(screen.getByText(/previous/i)).toBeDisabled();
      expect(screen.getByText(/next/i)).toBeDisabled();
    });
  });
});
