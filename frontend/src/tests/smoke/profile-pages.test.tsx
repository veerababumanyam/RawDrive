/**
 * Smoke tests for public profile pages.
 *
 * Verifies that both personal (/u/:slug) and company (/p/:slug) profile pages
 * render correctly through the shared PublicProfileRenderer, with avatar display,
 * theme application, and no console errors.
 *
 * @tags profile-smoke
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock react-router-dom useParams
vi.mock('react-router-dom', () => ({
  useParams: () => ({ slug: 'test-user' }),
}));

// Mock react-helmet-async
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div data-testid="helmet">{children}</div>,
}));

// Mock lucide-react icons -- use importOriginal to preserve all icon exports
// needed by the full component tree (ProfileSocials, ProfileHeader, etc.)
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
  };
});

// Mock personalProfileService
vi.mock('@/services/personalProfileService', () => ({
  personalProfileService: {
    getPublicProfile: vi.fn(),
    trackView: vi.fn().mockResolvedValue(undefined),
    getVCardUrl: vi.fn().mockReturnValue('/vcard/test'),
    getQrCodeUrl: vi.fn().mockReturnValue('/qr/test'),
  },
}));

// Mock companyProfileService
vi.mock('@/services/companyProfileService', () => ({
  companyProfileService: {
    getPublicProfile: vi.fn(),
    getVCardUrl: vi.fn().mockReturnValue('/vcard/test'),
    getQrCodeUrl: vi.fn().mockReturnValue('/qr/test'),
    getPublicLogoUrl: vi.fn().mockReturnValue('https://example.com/logo.jpg'),
  },
}));

// Mock matchMedia for dark mode detection
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const personalProfileData: Record<string, unknown> = {
  display_name: 'Jane Smith',
  bio: 'Professional Photographer',
  avatar_url: 'https://example.com/avatar.jpg',
  background_theme: 'theme-clean-slate',
  social_links: { instagram: 'https://instagram.com/janesmith' },
  email: 'jane@example.com',
  slug: 'jane-smith',
  public_url: 'https://rawdrive.in/u/jane-smith',
};

const companyProfileData: Record<string, unknown> = {
  company_name: 'Smith Studios',
  name: 'Smith Studios',
  display_name: 'Smith Studios',
  bio: 'Photography studio',
  logo_url: 'https://example.com/logo.jpg',
  avatar_url: 'https://example.com/logo.jpg',
  theme: { theme_id: 'minimal' },
  social_links: { website: 'https://smithstudios.com' },
  email: 'info@smithstudios.com',
  slug: 'smith-studios',
};

// ---------------------------------------------------------------------------
// Tests: PublicProfileRenderer directly (smoke tests)
// ---------------------------------------------------------------------------

import { PublicProfileRenderer } from '@/components/features/profile/shared/PublicProfileRenderer';

describe('Profile Pages Smoke Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Personal Profile', () => {
    it('renders display name when profile data is provided', () => {
      render(
        <PublicProfileRenderer
          profileData={personalProfileData}
          profileType="personal"
          themeId="theme-clean-slate"
        />
      );

      expect(screen.getByText('Jane Smith')).toBeDefined();
    });

    it('renders AvatarDisplay with avatar URL from profile data', () => {
      render(
        <PublicProfileRenderer
          profileData={personalProfileData}
          profileType="personal"
          themeId="theme-clean-slate"
        />
      );

      const avatar = screen.getByAltText('Jane Smith') as HTMLImageElement;
      expect(avatar).toBeDefined();
      expect(avatar.src).toContain('avatar.jpg');
    });

    it('shows initial letter fallback when avatar URL is null', () => {
      const dataWithoutAvatar = {
        ...personalProfileData,
        avatar_url: null,
      };

      render(
        <PublicProfileRenderer
          profileData={dataWithoutAvatar}
          profileType="personal"
          themeId="theme-clean-slate"
        />
      );

      // ProfileHeader shows the first character of displayName when no avatar
      // No <img> with alt="Jane Smith" should be rendered
      const imgs = screen.queryAllByAltText('Jane Smith');
      expect(imgs).toHaveLength(0);

      // The first letter "J" should appear as a fallback
      expect(screen.getByText('J')).toBeDefined();
    });

    it('renders without console errors', () => {
      render(
        <PublicProfileRenderer
          profileData={personalProfileData}
          profileType="personal"
          themeId="theme-clean-slate"
        />
      );

      const relevantErrors = consoleErrorSpy.mock.calls.filter(
        (call) => {
          const msg = String(call[0]);
          return !msg.includes('act(') && !msg.includes('Warning:');
        }
      );
      expect(relevantErrors).toHaveLength(0);
    });
  });

  describe('Company Profile', () => {
    it('renders company name when profile data is provided', () => {
      render(
        <PublicProfileRenderer
          profileData={companyProfileData}
          profileType="company"
          themeId="theme-clean-slate"
        />
      );

      expect(screen.getByText('Smith Studios')).toBeDefined();
    });

    it('renders without console errors', () => {
      render(
        <PublicProfileRenderer
          profileData={companyProfileData}
          profileType="company"
          themeId="minimal"
        />
      );

      const relevantErrors = consoleErrorSpy.mock.calls.filter(
        (call) => {
          const msg = String(call[0]);
          return !msg.includes('act(') && !msg.includes('Warning:');
        }
      );
      expect(relevantErrors).toHaveLength(0);
    });
  });

  describe('Theme Application', () => {
    it('applies theme CSS variables to scoped container when themeId is provided', () => {
      const { container } = render(
        <PublicProfileRenderer
          profileData={personalProfileData}
          profileType="personal"
          themeId="theme-clean-slate"
        />
      );

      const wrapper = container.querySelector('[data-profile-renderer]') as HTMLElement;
      expect(wrapper).toBeDefined();
      expect(wrapper).not.toBeNull();

      // UnifiedThemeEngine should have set CSS custom properties on the wrapper
      const bgVar = wrapper.style.getPropertyValue('--theme-bg');
      expect(bgVar).toBeTruthy();
    });

    it('resolves legacy theme ID without error', () => {
      // "minimal" is a legacy ID that should map to "theme-clean-slate"
      expect(() => {
        render(
          <PublicProfileRenderer
            profileData={companyProfileData}
            profileType="company"
            themeId="minimal"
          />
        );
      }).not.toThrow();

      const relevantErrors = consoleErrorSpy.mock.calls.filter(
        (call) => {
          const msg = String(call[0]);
          return !msg.includes('act(') && !msg.includes('Warning:');
        }
      );
      expect(relevantErrors).toHaveLength(0);
    });
  });
});
