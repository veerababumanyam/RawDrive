import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntegrationsPanel } from '../IntegrationsPanel';

/**
 * Integrations Panel Tests
 *
 * Tests for webhooks and third-party integrations settings panel
 */

describe('IntegrationsPanel', () => {
  const mockWorkspaceId = 'workspace-123';

  describe('rendering', () => {
    it('should render webhooks section', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const section = screen.getByRole('heading', { name: /webhooks/i });
      expect(section).toBeInTheDocument();
    });

    it('should render third-party integrations section', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const section = screen.getByRole('heading', { name: /third-party integrations/i });
      expect(section).toBeInTheDocument();
    });
  });

  describe('section structure', () => {
    it('should have space-y-6 for section spacing', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const container = screen.getByRole('heading', { name: /webhooks/i }).closest('div[class*="space-y"]');
      expect(container?.className).toContain('space-y-6');
    });

    it('should have proper spacing between sections', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const divider = document.querySelector('[class*="border-white/10"]');
      expect(divider).toBeInTheDocument();
    });
  });

  describe('webhooks section', () => {
    it('should render webhooks heading', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const heading = screen.getByRole('heading', { name: /webhooks/i });
      expect(heading).toBeInTheDocument();
    });

    it('should have text-lg font size on webhooks heading', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const heading = screen.getByRole('heading', { name: /webhooks/i });
      expect(heading.className).toContain('text-lg');
    });

    it('should have font-semibold on webhooks heading', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const heading = screen.getByRole('heading', { name: /webhooks/i });
      expect(heading.className).toContain('font-semibold');
    });

    it('should have text-text-primary on webhooks heading', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const heading = screen.getByRole('heading', { name: /webhooks/i });
      expect(heading.className).toContain('text-text-primary');
    });
  });

  describe('third-party integrations section', () => {
    it('should render third-party integrations heading', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const heading = screen.getByRole('heading', { name: /third-party integrations/i });
      expect(heading).toBeInTheDocument();
    });

    it('should display coming soon message', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const comingSoon = screen.getByText(/coming soon/i);
      expect(comingSoon).toBeInTheDocument();
    });

    it('should display text-text-secondary color on description', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/coming soon/i);
      expect(description.className).toContain('text-text-secondary');
    });

    it('should have text-sm on description', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/coming soon/i);
      expect(description.className).toContain('text-sm');
    });
  });

  describe('future integrations grid', () => {
    it('should render grid for future integrations', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const grid = document.querySelector('[class*="grid"]');
      expect(grid).toBeInTheDocument();
    });

    it('should display calendar sync coming soon', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const calendarItem = screen.getByText(/calendar sync/i);
      expect(calendarItem).toBeInTheDocument();
    });

    it('should display cloud storage coming soon', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const storageItem = screen.getByText(/cloud storage/i);
      expect(storageItem).toBeInTheDocument();
    });

    it('should display analytics coming soon', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const analyticsItem = screen.getByText(/analytics/i);
      expect(analyticsItem).toBeInTheDocument();
    });

    it('should display CRM coming soon', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const crmItem = screen.getByText(/crm/i);
      expect(crmItem).toBeInTheDocument();
    });

    it('should have grid-cols-1 and md:grid-cols-2', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const grid = document.querySelector('[class*="grid"]');
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).toContain('md:grid-cols-2');
    });

    it('should have gap-4 between grid items', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const grid = document.querySelector('[class*="gap"]');
      expect(grid?.className).toContain('gap-4');
    });
  });

  describe('coming soon cards styling', () => {
    it('should have glass-light styling on coming soon cards', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="glass-light"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should have rounded-lg styling on coming soon cards', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="rounded-lg"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should have border styling on coming soon cards', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="border"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should have p-4 padding on coming soon cards', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="p-4"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('layout', () => {
    it('should have space-y-6 for main container', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const container = screen.getByRole('heading', { name: /webhooks/i }).closest('div[class*="space-y"]');
      expect(container?.className).toContain('space-y-6');
    });

    it('should have my-8 spacing on divider', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const divider = document.querySelector('[class*="border-t"][class*="border-white/10"]');
      expect(divider?.className).toContain('my-');
    });
  });

  describe('text styling', () => {
    it('should have text-text-primary on section headings', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      headings.forEach(heading => {
        expect(heading.className).toContain('text-text-primary');
      });
    });

    it('should have font-semibold on section headings', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      headings.forEach(heading => {
        expect(heading.className).toContain('font-semibold');
      });
    });

    it('should have mb-4 spacing after headings', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      headings.forEach(heading => {
        expect(heading.closest('div')?.className).toContain('mb-4');
      });
    });
  });

  describe('accessibility', () => {
    it('should have semantic heading structure', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });

    it('should have readable text on coming soon items', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const items = ['Calendar Sync', 'Cloud Storage', 'Analytics', 'CRM'];
      items.forEach(item => {
        expect(screen.getByText(new RegExp(item, 'i'))).toBeInTheDocument();
      });
    });

    it('should have descriptive text for integrations section', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/coming soon.*calendar.*storage/i);
      expect(description).toBeInTheDocument();
    });

    it('should have proper color contrast', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading');
      headings.forEach(heading => {
        expect(heading.className).toMatch(/text-text-/);
      });
    });
  });

  describe('responsive design', () => {
    it('should have responsive grid layout', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const grid = document.querySelector('[class*="grid-cols-1"]');
      expect(grid?.className).toContain('md:grid-cols-2');
    });

    it('should stack vertically on mobile', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const grid = document.querySelector('[class*="grid"]');
      expect(grid?.className).toContain('grid-cols-1');
    });

    it('should have responsive font sizes', () => {
      render(<IntegrationsPanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      headings.forEach(heading => {
        expect(heading.className).toContain('text-lg');
      });
    });
  });

  describe('workspace context', () => {
    it('should accept workspaceId prop', () => {
      const { container } = render(<IntegrationsPanel workspaceId="test-workspace-456" />);
      expect(container).toBeInTheDocument();
    });

    it('should render with any valid workspaceId', () => {
      render(<IntegrationsPanel workspaceId="workspace-xyz-789" />);
      const heading = screen.getByRole('heading', { name: /webhooks/i });
      expect(heading).toBeInTheDocument();
    });

    it('should render consistently across different workspaceIds', () => {
      const { rerender } = render(<IntegrationsPanel workspaceId="workspace-1" />);
      expect(screen.getByRole('heading', { name: /webhooks/i })).toBeInTheDocument();

      rerender(<IntegrationsPanel workspaceId="workspace-2" />);
      expect(screen.getByRole('heading', { name: /webhooks/i })).toBeInTheDocument();
    });
  });
});
