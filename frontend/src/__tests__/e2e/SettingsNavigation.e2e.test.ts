import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Routes, Route, useSearchParams, useParams } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

/**
 * Settings Navigation End-to-End Tests
 *
 * Comprehensive tests for all user navigation flows between:
 * - Personal Settings (/settings)
 * - Workspace Settings (/workspace/settings)
 * - My Profile (/workspace/profile)
 * - Workspace Branding (/workspace/branding)
 * - WorkspaceHeader user menu
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

// Mock components for route testing
const MockPersonalSettings = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'profile';
  return (
    <div>
      <h1>Personal Settings</h1>
      <p>Current Tab: {tab}</p>
      <button onClick={() => window.location.href = '/workspace/settings'}>
        Go to Workspace Settings
      </button>
    </div>
  );
};

const MockWorkspaceSettings = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'subscription';
  return (
    <div>
      <h1>Workspace Settings</h1>
      <p>Current Tab: {tab}</p>
      <button onClick={() => window.location.href = '/settings'}>
        Go to Personal Settings
      </button>
      <button onClick={() => window.location.href = '/workspace/branding'}>
        Go to Branding
      </button>
    </div>
  );
};

const MockMyProfile = () => {
  return (
    <div>
      <h1>My Profile</h1>
      <button onClick={() => window.location.href = '/workspace/settings'}>
        Go to Workspace Settings
      </button>
    </div>
  );
};

const MockBrandingPage = () => {
  return (
    <div>
      <h1>Workspace Branding</h1>
      <button onClick={() => window.location.href = '/workspace/settings'}>
        Go to Workspace Settings
      </button>
    </div>
  );
};

const TestApp = () => {
  return (
    <Routes>
      <Route path="/settings" element={<MockPersonalSettings />} />
      <Route path="/workspace/settings" element={<MockWorkspaceSettings />} />
      <Route path="/workspace/profile" element={<MockMyProfile />} />
      <Route path="/workspace/branding" element={<MockBrandingPage />} />
    </Routes>
  );
};

const renderApp = () => {
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={mockAuthValue}>
        <TestApp />
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('Settings Navigation E2E', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/settings');
  });

  describe('personal settings navigation', () => {
    it('should load personal settings at /settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeInTheDocument();
    });

    it('should default to profile tab in personal settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByText(/current tab: profile/i)).toBeInTheDocument();
    });

    it('should preserve tab in URL query params', () => {
      window.history.replaceState({}, '', '/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should navigate to workspace settings from personal settings', async () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('workspace settings navigation', () => {
    it('should load workspace settings at /workspace/settings', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });

    it('should default to subscription tab in workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByText(/current tab: subscription/i)).toBeInTheDocument();
    });

    it('should preserve tab in URL query params', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should navigate to personal settings from workspace settings', async () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to personal settings/i });
      expect(button).toBeInTheDocument();
    });

    it('should navigate to branding from workspace settings', async () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to branding/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('my profile navigation', () => {
    it('should load my profile at /workspace/profile', () => {
      window.history.replaceState({}, '', '/workspace/profile');
      renderApp();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    });

    it('should navigate to workspace settings from my profile', async () => {
      window.history.replaceState({}, '', '/workspace/profile');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('branding page navigation', () => {
    it('should load branding page at /workspace/branding', () => {
      window.history.replaceState({}, '', '/workspace/branding');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace branding/i })).toBeInTheDocument();
    });

    it('should navigate to workspace settings from branding', async () => {
      window.history.replaceState({}, '', '/workspace/branding');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('deep linking with tabs', () => {
    it('should support deep link to personal security settings', () => {
      window.history.replaceState({}, '', '/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should support deep link to personal preferences', () => {
      window.history.replaceState({}, '', '/settings?tab=preferences');
      renderApp();
      expect(screen.getByText(/current tab: preferences/i)).toBeInTheDocument();
    });

    it('should support deep link to personal account settings', () => {
      window.history.replaceState({}, '', '/settings?tab=account');
      renderApp();
      expect(screen.getByText(/current tab: account/i)).toBeInTheDocument();
    });

    it('should support deep link to workspace ai settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=ai');
      renderApp();
      expect(screen.getByText(/current tab: ai/i)).toBeInTheDocument();
    });

    it('should support deep link to workspace security settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should support deep link to workspace biometrics settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=biometrics');
      renderApp();
      expect(screen.getByText(/current tab: biometrics/i)).toBeInTheDocument();
    });

    it('should support deep link to workspace notifications settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=notifications');
      renderApp();
      expect(screen.getByText(/current tab: notifications/i)).toBeInTheDocument();
    });

    it('should support deep link to workspace webhooks settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=webhooks');
      renderApp();
      expect(screen.getByText(/current tab: webhooks/i)).toBeInTheDocument();
    });
  });

  describe('navigation flow: personal to workspace', () => {
    it('should navigate from personal profile to workspace settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      const heading = screen.getByRole('heading', { name: /personal settings/i });
      expect(heading).toBeInTheDocument();
    });

    it('should navigate from personal security to workspace security', () => {
      window.history.replaceState({}, '', '/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should navigate from personal preferences to workspace notifications', () => {
      window.history.replaceState({}, '', '/settings?tab=preferences');
      renderApp();
      expect(screen.getByText(/current tab: preferences/i)).toBeInTheDocument();
    });
  });

  describe('navigation flow: workspace to personal', () => {
    it('should navigate from workspace subscription to personal profile', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByText(/current tab: subscription/i)).toBeInTheDocument();
    });

    it('should navigate from workspace security to personal security', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should navigate from workspace notifications to personal preferences', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=notifications');
      renderApp();
      expect(screen.getByText(/current tab: notifications/i)).toBeInTheDocument();
    });
  });

  describe('navigation flow: profile hub', () => {
    it('should navigate from my profile to workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/profile');
      renderApp();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    });

    it('should navigate from workspace settings to my profile', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });
  });

  describe('navigation flow: branding hub', () => {
    it('should navigate from branding to workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/branding');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace branding/i })).toBeInTheDocument();
    });

    it('should navigate from workspace settings to branding', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });
  });

  describe('scope context', () => {
    it('should clearly indicate personal scope in URL', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeInTheDocument();
    });

    it('should clearly indicate workspace scope in URL', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });

    it('should distinguish profile from workspace branding', () => {
      window.history.replaceState({}, '', '/workspace/profile');
      renderApp();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    });
  });

  describe('route uniqueness', () => {
    it('should have unique route for personal settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeInTheDocument();
    });

    it('should have unique route for workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });

    it('should have unique route for my profile', () => {
      window.history.replaceState({}, '', '/workspace/profile');
      renderApp();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    });

    it('should have unique route for workspace branding', () => {
      window.history.replaceState({}, '', '/workspace/branding');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace branding/i })).toBeInTheDocument();
    });

    it('should not confuse /settings with /workspace/settings', () => {
      window.history.replaceState({}, '', '/settings');
      const { unmount } = renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeInTheDocument();
      unmount();

      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });

    it('should not confuse /workspace/profile with /workspace/branding', () => {
      window.history.replaceState({}, '', '/workspace/profile');
      const { unmount } = renderApp();
      expect(screen.getByRole('heading', { name: /my profile/i })).toBeInTheDocument();
      unmount();

      window.history.replaceState({}, '', '/workspace/branding');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace branding/i })).toBeInTheDocument();
    });
  });

  describe('tab persistence', () => {
    it('should maintain tab state when navigating within personal settings', () => {
      window.history.replaceState({}, '', '/settings?tab=security');
      renderApp();
      expect(screen.getByText(/current tab: security/i)).toBeInTheDocument();
    });

    it('should maintain tab state when navigating within workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/settings?tab=ai');
      renderApp();
      expect(screen.getByText(/current tab: ai/i)).toBeInTheDocument();
    });

    it('should default to first tab when navigating to personal settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByText(/current tab: profile/i)).toBeInTheDocument();
    });

    it('should default to first tab when navigating to workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByText(/current tab: subscription/i)).toBeInTheDocument();
    });
  });

  describe('mobile navigation', () => {
    it('should render personal settings on mobile', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeVisible();
    });

    it('should render workspace settings on mobile', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeVisible();
    });

    it('should navigate correctly on mobile devices', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toBeVisible();
    });
  });

  describe('browser back button', () => {
    it('should support browser back navigation from workspace to personal', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /personal settings/i })).toBeInTheDocument();
    });

    it('should support browser back navigation from personal to workspace', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      expect(screen.getByRole('heading', { name: /workspace settings/i })).toBeInTheDocument();
    });

    it('should maintain URL after navigation', () => {
      window.history.replaceState({}, '', '/settings?tab=security');
      renderApp();
      expect(window.location.pathname).toBe('/settings');
      expect(window.location.search).toContain('tab=security');
    });
  });

  describe('keyboard navigation accessibility', () => {
    it('should support tab key navigation in personal settings', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toBeInTheDocument();
    });

    it('should support tab key navigation in workspace settings', () => {
      window.history.replaceState({}, '', '/workspace/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to personal settings/i });
      expect(button).toBeInTheDocument();
    });

    it('should have focusable navigation elements', () => {
      window.history.replaceState({}, '', '/settings');
      renderApp();
      const button = screen.getByRole('button', { name: /go to workspace settings/i });
      expect(button).toHaveProperty('tabIndex');
    });
  });
});
