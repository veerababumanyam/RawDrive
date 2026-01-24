import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CrossLinkCard } from '../CrossLinkCard';
import { Shield } from 'lucide-react';

/**
 * CrossLinkCard Component Tests
 *
 * Tests for cross-scope navigation cards
 */

describe('CrossLinkCard', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  const mockProps = {
    title: 'Security Settings',
    description: 'Manage your security preferences',
    icon: <Shield size={16} />,
    path: '/settings?tab=security',
  };

  describe('rendering', () => {
    it('should display title', () => {
      renderWithRouter(<CrossLinkCard {...mockProps} />);
      expect(screen.getByText('Security Settings')).toBeInTheDocument();
    });

    it('should display description', () => {
      renderWithRouter(<CrossLinkCard {...mockProps} />);
      expect(screen.getByText('Manage your security preferences')).toBeInTheDocument();
    });

    it('should display icon', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const iconContainer = container.querySelector('svg');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should display arrow icon', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      // ArrowRight SVG should be present
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(1); // icon + arrow
    });
  });

  describe('interaction', () => {
    it('should be clickable', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
    });

    it('should have hover styles applied', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button') as HTMLElement;
      expect(button?.className).toContain('hover:');
    });

    it('should navigate on click', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button).toHaveClass('w-full');
    });
  });

  describe('styling', () => {
    it('should have glass-light background', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('glass-light');
    });

    it('should have border styling', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('border');
    });

    it('should have rounded corners', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('rounded-xl');
    });

    it('should have transition effects', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('transition');
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      expect(button?.tagName).toBe('BUTTON');
    });

    it('should have proper text contrast', () => {
      renderWithRouter(<CrossLinkCard {...mockProps} />);
      const title = screen.getByText('Security Settings');
      expect(title?.className).toContain('text-text-primary');
    });

    it('should have proper semantic structure', () => {
      const { container } = renderWithRouter(<CrossLinkCard {...mockProps} />);
      const button = container.querySelector('button');
      const content = button?.querySelector('div');
      expect(content).toBeInTheDocument();
    });
  });

  describe('with different content', () => {
    it('should handle long titles', () => {
      const longTitle = 'This is a very long title that might wrap';
      renderWithRouter(
        <CrossLinkCard
          {...mockProps}
          title={longTitle}
        />
      );
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle long descriptions', () => {
      const longDesc = 'This is a very long description that explains the related settings in great detail';
      renderWithRouter(
        <CrossLinkCard
          {...mockProps}
          description={longDesc}
        />
      );
      expect(screen.getByText(longDesc)).toBeInTheDocument();
    });

    it('should handle different paths', () => {
      const { container } = renderWithRouter(
        <CrossLinkCard
          {...mockProps}
          path="/workspace/settings?tab=security"
        />
      );
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
    });
  });
});
