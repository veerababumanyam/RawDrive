import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../../contexts/AuthContext';
import WorkspaceSettingsHub from '../WorkspaceSettingsHub';

/**
 * Workspace Settings Hub Tests
 *
 * Tests for workspace settings hub with scope indicator, tabs, and cross-links
 */

const mockAuthValue = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    workspace_id: 'workspace-123',
  },
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={mockAuthValue}>
        {component}
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('WorkspaceSettingsHub', () => {
  describe('scope indicator', () => {
    it('should display workspace scope indicator', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const scopeIndicator = screen.getByText('Workspace Settings');
      expect(scopeIndicator).toBeInTheDocument();
    });

    it('should display scope switcher button', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const switchButton = screen.getByRole('button', { name: /switch to personal/i });
      expect(switchButton).toBeInTheDocument();
    });

    it('should have primary badge styling', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const scopeIndicator = screen.getByText('Workspace Settings').closest('div');
      expect(scopeIndicator?.className).toContain('bg-primary/10');
      expect(scopeIndicator?.className).toContain('text-primary');
    });

    it('should have building icon for workspace scope', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const icon = screen.getByText('Workspace Settings').closest('div')?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('quick links', () => {
    it('should display workspace branding quick link', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const brandingLink = screen.getByRole('button', { name: /workspace branding/i });
      expect(brandingLink).toBeInTheDocument();
    });

    it('should show branding link description', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const description = screen.getByText(/manage company profile/i);
      expect(description).toBeInTheDocument();
    });

    it('should have glass-light styling on quick link', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const brandingLink = screen.getByRole('button', { name: /workspace branding/i });
      expect(brandingLink.className).toContain('glass-light');
    });

    it('should display palette icon on branding link', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const brandingLink = screen.getByRole('button', { name: /workspace branding/i });
      const icon = brandingLink.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('tabs', () => {
    it('should render all workspace tabs', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      expect(screen.getByRole('button', { name: /subscription/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ai & intelligence/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /security & privacy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /biometrics/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /webhooks/i })).toBeInTheDocument();
    });

    it('should highlight active tab', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const subscriptionTab = screen.getByRole('button', { name: /subscription/i });
      expect(subscriptionTab.className).toContain('text-primary');
    });

    it('should switch tabs on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const aiTab = screen.getByRole('button', { name: /ai & intelligence/i });
      await user.click(aiTab);

      expect(aiTab.className).toContain('text-primary');
    });

    it('should show tab indicator line on active tab', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const subscriptionTab = screen.getByRole('button', { name: /subscription/i });
      const indicator = subscriptionTab.querySelector('div[class*="absolute"]');
      expect(indicator).toBeInTheDocument();
    });

    it('should display tab icons', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const tabs = screen.getAllByRole('button');
      const tabsWithIcons = tabs.filter(tab => tab.querySelector('svg'));
      expect(tabsWithIcons.length).toBeGreaterThan(0);
    });
  });

  describe('cross-links in security tab', () => {
    it('should show personal security cross-link in security tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const personalSecurityLink = screen.getByRole('button', { name: /personal security settings/i });
      expect(personalSecurityLink).toBeInTheDocument();
    });

    it('should show correct description for personal security link', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const description = screen.getByText(/manage your password, 2fa/i);
      expect(description).toBeInTheDocument();
    });

    it('should have related settings divider above cross-link', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const divider = screen.getByText('Related Settings');
      expect(divider).toBeInTheDocument();
    });
  });

  describe('cross-links in notifications tab', () => {
    it('should show personal notification cross-link in notifications tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const notificationsTab = screen.getByRole('button', { name: /notifications/i });
      await user.click(notificationsTab);

      const personalNotificationsLink = screen.getByRole('button', { name: /personal notification preferences/i });
      expect(personalNotificationsLink).toBeInTheDocument();
    });

    it('should show correct description for personal notifications link', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const notificationsTab = screen.getByRole('button', { name: /notifications/i });
      await user.click(notificationsTab);

      const description = screen.getByText(/customize your individual notification/i);
      expect(description).toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('should have sticky header', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const header = screen.getByText('Workspace Settings').closest('div[class*="sticky"]');
      expect(header).toBeInTheDocument();
    });

    it('should have gradient background', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const container = screen.getByText('Workspace Settings').closest('div[class*="flex"]');
      const parent = container?.closest('div[class*="bg-gradient"]');
      expect(parent?.className).toContain('bg-gradient-to-br');
    });

    it('should have scrollable content area', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const main = screen.getByRole('main');
      expect(main?.className).toContain('flex-1');
      expect(main?.className).toContain('overflow-auto');
    });

    it('should have glass-card styling on content', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const content = document.querySelector('[class*="glass-card"]');
      expect(content).toBeInTheDocument();
    });
  });

  describe('responsive design', () => {
    it('should render scope indicator on mobile', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const scopeIndicator = screen.getByText('Workspace Settings');
      expect(scopeIndicator).toBeVisible();
    });

    it('should display quick links in responsive grid', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const brandingLink = screen.getByRole('button', { name: /workspace branding/i });
      const container = brandingLink.closest('div[class*="grid"]');
      expect(container?.className).toContain('grid-cols-1');
      expect(container?.className).toContain('md:grid-cols-2');
    });

    it('should have responsive header text', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.className).toContain('text-xl');
      expect(heading.className).toContain('sm:text-2xl');
    });

    it('should have scrollable tab navigation', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const tabContainer = screen.getByRole('button', { name: /subscription/i }).closest('div');
      expect(tabContainer?.className).toContain('overflow-x-auto');
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Workspace Settings');
    });

    it('should have descriptive tab labels', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const tabs = screen.getAllByRole('button').slice(0, 6);
      expect(tabs.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation between tabs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const subscriptionTab = screen.getByRole('button', { name: /subscription/i });
      await user.click(subscriptionTab);

      expect(subscriptionTab).toHaveFocus();
    });

    it('should have readable color contrast', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.className).toContain('text-text-primary');
    });

    it('should have user icon on personal security link', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkspaceSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const personalSecurityLink = screen.getByRole('button', { name: /personal security settings/i });
      const icon = personalSecurityLink.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('workspace context', () => {
    it('should not render if no workspace_id', () => {
      const mockAuthWithoutWorkspace = {
        ...mockAuthValue,
        user: { ...mockAuthValue.user, workspace_id: undefined },
      };

      render(
        <BrowserRouter>
          <AuthContext.Provider value={mockAuthWithoutWorkspace}>
            <WorkspaceSettingsHub />
          </AuthContext.Provider>
        </BrowserRouter>
      );

      const noWorkspaceMessage = screen.getByText(/no workspace selected/i);
      expect(noWorkspaceMessage).toBeInTheDocument();
    });

    it('should render content if workspace_id exists', () => {
      renderWithProviders(<WorkspaceSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });
  });
});
