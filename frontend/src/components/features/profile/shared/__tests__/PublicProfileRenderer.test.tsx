import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { PublicProfileRenderer } from '../PublicProfileRenderer';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...props, ref }, children as React.ReactNode)
    ),
    a: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLAnchorElement>) =>
      React.createElement('a', { ...props, ref }, children as React.ReactNode)
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  useReducedMotion: () => false,
}));

// Mock UnifiedThemeEngine
const mockApplyThemeToRoot = vi.fn();
const mockRemoveThemeFromRoot = vi.fn();
const mockResolveThemeTokens = vi.fn().mockReturnValue({
  '--theme-bg': '#FFFFFF',
  '--theme-surface': '#FAFAFA',
  '--theme-text': '#1A1A1A',
  '--theme-text-secondary': '#6B7280',
  '--theme-accent': '#3B82F6',
  '--theme-primary': '#1A1A1A',
  '--theme-border': '#E5E5E5',
  '--theme-font-heading': "'Inter', system-ui, sans-serif",
  '--theme-font-body': "'Inter', system-ui, sans-serif",
  '--theme-radius': '1rem',
  '--theme-shadow': '0 4px 6px -1px rgba(0,0,0,0.1)',
  '--theme-gradient': 'linear-gradient(180deg, #FFFFFF, #FAFAFA)',
  '--theme-animation-type': 'gradient-shift',
});

vi.mock('../UnifiedThemeEngine', () => ({
  resolveThemeTokens: (...args: unknown[]) => mockResolveThemeTokens(...args),
  applyThemeToContainer: (...args: unknown[]) => mockApplyThemeToRoot(...args),
  removeThemeFromContainer: (...args: unknown[]) => mockRemoveThemeFromRoot(...args),
  resolveThemeId: (id: string) => id || 'theme-clean-slate',
}));

describe('PublicProfileRenderer', () => {
  const personalData: Record<string, unknown> = {
    display_name: 'John Doe',
    bio: 'A passionate photographer based in NYC',
    title: 'Wedding Photographer',
    location: 'New York, NY',
    avatar_url: 'https://example.com/avatar.jpg',
    email: 'john@example.com',
    social_links: { instagram: 'https://instagram.com/john' },
  };

  const companyData: Record<string, unknown> = {
    company_name: 'Doe Photography LLC',
    logo_url: 'https://example.com/logo.jpg',
    bio: 'Professional photography studio',
    email: 'info@doe.com',
    social_links: { instagram: 'https://instagram.com/doe' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock matchMedia for prefers-color-scheme detection
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

  afterEach(() => {
    cleanup();
  });

  it('renders with profileType=personal and shows sections', () => {
    const { container } = render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-clean-slate"
      />
    );
    // Should render something
    expect(container.innerHTML).toBeTruthy();
    expect(container.querySelector('[data-profile-renderer]')).toBeTruthy();
  });

  it('renders with profileType=company and shows sections', () => {
    const { container } = render(
      <PublicProfileRenderer
        profileData={companyData}
        profileType="company"
        themeId="theme-clean-slate"
      />
    );
    expect(container.innerHTML).toBeTruthy();
    expect(container.querySelector('[data-profile-renderer]')).toBeTruthy();
  });

  it('applies theme via UnifiedThemeEngine on mount', () => {
    render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-vivid-impact"
      />
    );
    expect(mockResolveThemeTokens).toHaveBeenCalled();
    // applyThemeToContainer should have been called with tokens and a scoped element
    expect(mockApplyThemeToRoot).toHaveBeenCalled();
  });

  it('cleans up theme CSS vars on unmount', () => {
    const { unmount } = render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-clean-slate"
      />
    );
    unmount();
    expect(mockRemoveThemeFromRoot).toHaveBeenCalled();
  });

  it('renders AnimatedBackgroundRenderer component', () => {
    const { container } = render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-clean-slate"
      />
    );
    // AnimatedBackgroundRenderer should wrap the content
    const animatedBg = container.querySelector('[data-animated-background]');
    expect(animatedBg).toBeTruthy();
  });

  it('passes correct animationType from theme tokens to AnimatedBackgroundRenderer', () => {
    mockResolveThemeTokens.mockReturnValueOnce({
      '--theme-bg': '#FFFFFF',
      '--theme-surface': '#FAFAFA',
      '--theme-text': '#1A1A1A',
      '--theme-text-secondary': '#6B7280',
      '--theme-accent': '#3B82F6',
      '--theme-primary': '#1A1A1A',
      '--theme-border': '#E5E5E5',
      '--theme-font-heading': "'Inter', system-ui, sans-serif",
      '--theme-font-body': "'Inter', system-ui, sans-serif",
      '--theme-radius': '1rem',
      '--theme-shadow': '0 4px 6px -1px rgba(0,0,0,0.1)',
      '--theme-gradient': 'linear-gradient(180deg, #FFFFFF, #FAFAFA)',
      '--theme-animation-type': 'aurora',
    });

    const { container } = render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-dark-elegance"
      />
    );
    const animatedBg = container.querySelector('[data-animated-background]');
    expect(animatedBg).toBeTruthy();
    expect(animatedBg?.getAttribute('data-animation-type')).toBe('aurora');
  });

  it('applies dark mode class when useColorScheme returns dark', () => {
    // Override matchMedia to return dark
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // resolveThemeTokens should be called with prefersDark=true
    const { container } = render(
      <PublicProfileRenderer
        profileData={personalData}
        profileType="personal"
        themeId="theme-clean-slate"
      />
    );
    // Verify resolveThemeTokens was called with dark=true
    expect(mockResolveThemeTokens).toHaveBeenCalledWith('theme-clean-slate', true);
    // The wrapper should have the dark data attribute
    const wrapper = container.querySelector('[data-profile-renderer]');
    expect(wrapper?.getAttribute('data-color-scheme')).toBe('dark');
  });
});
