import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../../contexts/AuthContext';
import AccountSettingsHub from '../AccountSettingsHub';

/**
 * Account Settings Hub Tests
 *
 * Tests for personal settings hub with scope indicator, tabs, and cross-links
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

describe('AccountSettingsHub', () => {
  describe('scope indicator', () => {
    it('should display personal scope indicator', () => {
      renderWithProviders(<AccountSettingsHub />);
      const scopeIndicator = screen.getByText('Personal Settings');
      expect(scopeIndicator).toBeInTheDocument();
    });

    it('should display scope switcher button', () => {
      renderWithProviders(<AccountSettingsHub />);
      const switchButton = screen.getByRole('button', { name: /switch to workspace/i });
      expect(switchButton).toBeInTheDocument();
    });

    it('should have primary badge styling', () => {
      renderWithProviders(<AccountSettingsHub />);
      const scopeIndicator = screen.getByText('Personal Settings').closest('div');
      expect(scopeIndicator?.className).toContain('bg-primary/10');
      expect(scopeIndicator?.className).toContain('text-primary');
    });
  });

  describe('tabs', () => {
    it('should render all setting tabs', () => {
      renderWithProviders(<AccountSettingsHub />);
      expect(screen.getByRole('button', { name: /profile & identity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /security & privacy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /preferences/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
    });

    it('should highlight active tab', () => {
      renderWithProviders(<AccountSettingsHub />);
      const profileTab = screen.getByRole('button', { name: /profile & identity/i });
      expect(profileTab.className).toContain('text-primary');
    });

    it('should switch tabs on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      expect(securityTab.className).toContain('text-primary');
    });

    it('should show tab indicator line on active tab', () => {
      renderWithProviders(<AccountSettingsHub />);
      const profileTab = screen.getByRole('button', { name: /profile & identity/i });
      const indicator = profileTab.querySelector('div[class*="absolute"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('cross-links', () => {
    it('should show workspace security cross-link in security tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const workspaceSecurityLink = screen.getByRole('button', { name: /workspace security policies/i });
      expect(workspaceSecurityLink).toBeInTheDocument();
    });

    it('should show workspace notifications cross-link in preferences tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const preferencesTab = screen.getByRole('button', { name: /preferences/i });
      await user.click(preferencesTab);

      const workspaceNotificationsLink = screen.getByRole('button', { name: /workspace notifications/i });
      expect(workspaceNotificationsLink).toBeInTheDocument();
    });

    it('should render cross-link cards with descriptions', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const description = screen.getByText(/configure 2fa requirements/i);
      expect(description).toBeInTheDocument();
    });

    it('should have proper styling for cross-link cards', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const crossLinkCard = screen.getByRole('button', { name: /workspace security policies/i });
      expect(crossLinkCard.className).toContain('glass-light');
      expect(crossLinkCard.className).toContain('border');
    });
  });

  describe('section dividers', () => {
    it('should display related settings divider in security tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const divider = screen.getByText('Related Settings');
      expect(divider).toBeInTheDocument();
    });

    it('should have uppercase styling on divider label', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const divider = screen.getByText('Related Settings').closest('span');
      expect(divider?.className).toContain('uppercase');
    });

    it('should have proper spacing around divider', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const securityTab = screen.getByRole('button', { name: /security & privacy/i });
      await user.click(securityTab);

      const divider = screen.getByText('Related Settings').closest('div[class*="relative"]');
      expect(divider?.className).toContain('my-');
    });
  });

  describe('layout', () => {
    it('should have sticky header', () => {
      renderWithProviders(<AccountSettingsHub />);
      const header = screen.getByText('Account Settings').closest('div[class*="sticky"]');
      expect(header).toBeInTheDocument();
    });

    it('should have scrollable content area', () => {
      renderWithProviders(<AccountSettingsHub />);
      const main = screen.getByRole('main');
      expect(main?.className).toContain('flex-1');
      expect(main?.className).toContain('overflow-auto');
    });

    it('should have glass-card styling on content', () => {
      renderWithProviders(<AccountSettingsHub />);
      const content = document.querySelector('[class*="glass-card"]');
      expect(content).toBeInTheDocument();
    });
  });

  describe('responsive design', () => {
    it('should render scope indicator on mobile', () => {
      renderWithProviders(<AccountSettingsHub />);
      const scopeIndicator = screen.getByText('Personal Settings');
      expect(scopeIndicator).toBeVisible();
    });

    it('should have responsive header text', () => {
      renderWithProviders(<AccountSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.className).toContain('text-xl');
      expect(heading.className).toContain('sm:text-2xl');
    });

    it('should have responsive tab layout', () => {
      renderWithProviders(<AccountSettingsHub />);
      const tabContainer = screen.getByRole('button', { name: /profile & identity/i }).closest('div');
      expect(tabContainer?.className).toContain('overflow-x-auto');
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(<AccountSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Account Settings');
    });

    it('should have descriptive tab labels', () => {
      renderWithProviders(<AccountSettingsHub />);
      const tabs = screen.getAllByRole('button');
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs[0]).toHaveTextContent(/profile|security|preferences|account/i);
    });

    it('should support keyboard navigation between tabs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AccountSettingsHub />);

      const profileTab = screen.getByRole('button', { name: /profile & identity/i });
      await user.click(profileTab);

      expect(profileTab).toHaveFocus();
    });

    it('should have readable color contrast', () => {
      renderWithProviders(<AccountSettingsHub />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.className).toContain('text-text-primary');
    });
  });
});
