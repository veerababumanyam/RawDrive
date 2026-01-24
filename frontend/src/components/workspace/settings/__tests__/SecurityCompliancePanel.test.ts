import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SecurityCompliancePanel } from '../SecurityCompliancePanel';

/**
 * Security & Compliance Panel Tests
 *
 * Tests for unified security, biometrics, and compliance settings panel
 */

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('SecurityCompliancePanel', () => {
  const mockWorkspaceId = 'workspace-123';

  describe('rendering', () => {
    it('should render security policies section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const section = screen.getByRole('heading', { name: /security policies/i });
      expect(section).toBeInTheDocument();
    });

    it('should render biometric settings section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const section = screen.getByRole('heading', { name: /biometric settings/i });
      expect(section).toBeInTheDocument();
    });

    it('should render compliance & privacy section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const section = screen.getByRole('heading', { name: /compliance & privacy/i });
      expect(section).toBeInTheDocument();
    });
  });

  describe('section headers', () => {
    it('should have shield icon for security section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeader = screen.getByRole('heading', { name: /security policies/i });
      const iconContainer = securityHeader.closest('div[class*="flex"]');
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('should have lock icon for biometric section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const biometricHeader = screen.getByRole('heading', { name: /biometric settings/i });
      const iconContainer = biometricHeader.closest('div[class*="flex"]');
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('should have check-circle icon for compliance section', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const complianceHeader = screen.getByRole('heading', { name: /compliance & privacy/i });
      const iconContainer = complianceHeader.closest('div[class*="flex"]');
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('should have primary colored icon backgrounds', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const iconBadges = document.querySelectorAll('[class*="bg-primary/10"]');
      expect(iconBadges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('section descriptions', () => {
    it('should describe security policies functionality', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/configure security requirements for all team members/i);
      expect(description).toBeInTheDocument();
    });

    it('should describe biometric settings functionality', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/manage face recognition and biometric consent/i);
      expect(description).toBeInTheDocument();
    });

    it('should describe compliance functionality', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/configure gdpr compliance, analytics, and data handling/i);
      expect(description).toBeInTheDocument();
    });
  });

  describe('compliance section details', () => {
    it('should render GDPR compliance card', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const gdprCard = screen.getByRole('heading', { name: /gdpr compliance mode/i });
      expect(gdprCard).toBeInTheDocument();
    });

    it('should render analytics & search indexing card', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const analyticsCard = screen.getByRole('heading', { name: /analytics & search indexing/i });
      expect(analyticsCard).toBeInTheDocument();
    });

    it('should display GDPR card description', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/enable strict data handling and export capabilities/i);
      expect(description).toBeInTheDocument();
    });

    it('should display analytics card description', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/control workspace analytics collection/i);
      expect(description).toBeInTheDocument();
    });

    it('should have alert-triangle icon on GDPR card', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const gdprCard = screen.getByRole('heading', { name: /gdpr compliance mode/i });
      const container = gdprCard.closest('div[class*="mb-2"]');
      expect(container?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('placeholder content', () => {
    it('should display GDPR settings placeholder', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const placeholder = screen.getByText(/gdpr settings configuration will be displayed here/i);
      expect(placeholder).toBeInTheDocument();
    });

    it('should display analytics settings placeholder', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const placeholder = screen.getByText(/analytics and indexing preferences will be displayed here/i);
      expect(placeholder).toBeInTheDocument();
    });

    it('should have surface styling on placeholders', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const placeholders = document.querySelectorAll('[class*="bg-surface"]');
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it('should have rounded-lg styling on placeholders', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const placeholders = document.querySelectorAll('[class*="rounded-lg"]');
      expect(placeholders.length).toBeGreaterThan(0);
    });
  });

  describe('section dividers', () => {
    it('should display divider between sections', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const dividers = document.querySelectorAll('[class*="border-white/10"]');
      expect(dividers.length).toBeGreaterThanOrEqual(2);
    });

    it('should have my-8 spacing on dividers', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const dividerContainer = document.querySelector('[class*="border-t"][class*="border-white/10"]');
      expect(dividerContainer?.className).toContain('my-');
    });
  });

  describe('layout', () => {
    it('should have space-y-8 for main container', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const container = screen.getByRole('heading', { name: /security policies/i }).closest('div[class*="space-y-8"]');
      expect(container).toBeInTheDocument();
    });

    it('should have proper flex layout for headers', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeader = screen.getByRole('heading', { name: /security policies/i });
      const headerContainer = securityHeader.closest('div[class*="flex"]');
      expect(headerContainer?.className).toContain('flex');
      expect(headerContainer?.className).toContain('items-center');
      expect(headerContainer?.className).toContain('gap-3');
    });

    it('should have border-l styling on left border', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const borderContainers = document.querySelectorAll('[class*="border-l"]');
      expect(borderContainers.length).toBeGreaterThan(0);
    });

    it('should have mb-4 spacing below headers', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeader = screen.getByRole('heading', { name: /security policies/i });
      const headerContainer = securityHeader.closest('div[class*="mb-4"]');
      expect(headerContainer?.className).toContain('mb-4');
    });
  });

  describe('card styling', () => {
    it('should have glass-light styling on compliance cards', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="glass-light"]');
      expect(cards.length).toBeGreaterThanOrEqual(2);
    });

    it('should have rounded-xl on compliance cards', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="rounded-xl"]');
      expect(cards.length).toBeGreaterThanOrEqual(2);
    });

    it('should have border styling on compliance cards', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="border"][class*="border-white/10"]');
      expect(cards.length).toBeGreaterThanOrEqual(2);
    });

    it('should have p-4 padding on compliance cards', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const cards = document.querySelectorAll('[class*="p-4"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('text styling', () => {
    it('should have text-lg font size for section headings', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeading = screen.getByRole('heading', { name: /security policies/i });
      expect(securityHeading.className).toContain('text-lg');
    });

    it('should have font-semibold on section headings', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeading = screen.getByRole('heading', { name: /security policies/i });
      expect(securityHeading.className).toContain('font-semibold');
    });

    it('should have text-text-primary on section headings', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const securityHeading = screen.getByRole('heading', { name: /security policies/i });
      expect(securityHeading.className).toContain('text-text-primary');
    });

    it('should have text-sm on description text', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/configure security requirements/i);
      expect(description.className).toContain('text-sm');
    });

    it('should have text-text-secondary on descriptions', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/configure security requirements/i);
      expect(description.className).toContain('text-text-secondary');
    });
  });

  describe('cross-link', () => {
    it('should render cross-link card to personal security', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const crossLink = screen.getByRole('button', { name: /personal security settings/i });
      expect(crossLink).toBeInTheDocument();
    });

    it('should display cross-link description', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const description = screen.getByText(/manage your password, 2fa/i);
      expect(description).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have semantic heading structure', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings.length).toBeGreaterThanOrEqual(3);
    });

    it('should have readable color contrast on text', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      const headings = screen.getAllByRole('heading');
      headings.forEach(heading => {
        expect(heading.className).toMatch(/text-text-(primary|secondary)/);
      });
    });

    it('should have descriptive text for all sections', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId={mockWorkspaceId} />);
      expect(screen.getByText(/configure security requirements/i)).toBeInTheDocument();
      expect(screen.getByText(/manage face recognition/i)).toBeInTheDocument();
      expect(screen.getByText(/configure gdpr compliance/i)).toBeInTheDocument();
    });
  });

  describe('workspace context', () => {
    it('should accept workspaceId prop', () => {
      const { container } = render(
        <BrowserRouter>
          <SecurityCompliancePanel workspaceId="test-workspace-456" />
        </BrowserRouter>
      );
      expect(container).toBeInTheDocument();
    });

    it('should render with any valid workspaceId', () => {
      renderWithRouter(<SecurityCompliancePanel workspaceId="workspace-xyz-789" />);
      const heading = screen.getByRole('heading', { name: /security policies/i });
      expect(heading).toBeInTheDocument();
    });
  });
});
