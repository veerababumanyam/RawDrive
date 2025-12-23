/**
 * Integration Tests: Theme Workflow
 *
 * Tests the complete theme workflow:
 * 1. Theme selection in ThemeSelector
 * 2. Theme data transformation via themeTransformer
 * 3. ProfileCard receives correct props
 * 4. PublicProfileView applies theme on render
 *
 * Requirements: 1.1, 1.2, 1.5, 2.1, 2.3, 10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import {
  transformThemeForProfileCard,
  extractFontsToLoad,
  type BackendThemeData,
  type ThemeTransformInput,
} from '../../../../utils/themeTransformer';
import { ProfileCard, type ProfileCardProps } from '../ProfileCard';

// =============================================================================
// Test Setup
// =============================================================================

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

// Mock profile data
const mockProfile = {
  name: 'Test Company',
  tagline: 'Your trusted partner',
  email: 'test@example.com',
  phone: '+1-555-0100',
  website: 'https://example.com',
  slug: 'test-company',
};

// Mock backend theme data (API format)
const mockApiTheme: BackendThemeData = {
  theme_id: 'sunset-vibes',
  name: 'Sunset Vibes',
  category: 'creative',
  base_colors: {
    primary: '#F97316',
    secondary: '#FB923C',
    accent: '#FBBF24',
    background: '#FFFBEB',
    surface: '#FEF3C7',
    text: '#1C1917',
    gradients: [
      {
        name: 'sunset',
        type: 'linear',
        direction: '135deg',
        stops: ['#F97316', '#FB923C', '#FBBF24'],
      },
    ],
  },
  typography: {
    heading_font: {
      family: 'Montserrat',
      source: 'web',
      fallback: ['sans-serif'],
      weights: [400, 600, 700],
    },
    body_font: {
      family: 'Open Sans',
      source: 'web',
      fallback: ['system-ui', 'sans-serif'],
      weights: [400, 500],
    },
  },
  layout: {
    spacing: 'normal',
    hero_style: 'card',
    section_layout: 'single-column',
  },
};

// =============================================================================
// Theme Transformation Tests
// =============================================================================

describe('Theme Workflow Integration', () => {
  describe('Theme Transformation', () => {
    it('transforms API theme data correctly', () => {
      const input: ThemeTransformInput = {
        apiTheme: mockApiTheme,
      };

      const result = transformThemeForProfileCard(input);

      // Should have correct colors
      expect(result.themeColors).toBeDefined();
      expect(result.themeColors?.primary).toBe('#F97316');
      expect(result.themeColors?.secondary).toBe('#FB923C');
      expect(result.themeColors?.accent).toBe('#FBBF24');

      // Should have correct typography
      expect(result.themeTypography).toBeDefined();
      expect(result.themeTypography?.headingFont).toContain('Montserrat');
      expect(result.themeTypography?.bodyFont).toContain('Open Sans');

      // Should have correct layout
      expect(result.themeLayout).toBeDefined();
      expect(result.themeLayout?.spacing).toBe('normal');
      expect(result.themeLayout?.heroStyle).toBe('card');

      // Should have gradient
      expect(result.backgroundGradient).toBeDefined();
      expect(result.backgroundGradient).toContain('linear-gradient');
      expect(result.backgroundGradient).toContain('135deg');
    });

    it('returns empty object when no theme data provided', () => {
      const input: ThemeTransformInput = {};
      const result = transformThemeForProfileCard(input);
      expect(result).toEqual({});
    });

    it('applies default colors for invalid color values', () => {
      const input: ThemeTransformInput = {
        apiTheme: {
          theme_id: 'test',
          base_colors: {
            primary: 'invalid-color',
            secondary: '#64748B', // valid
            accent: 'not-a-color',
          },
        },
      };

      const result = transformThemeForProfileCard(input);

      // Invalid colors should get defaults
      expect(result.themeColors?.primary).toBe('#2563EB'); // default
      expect(result.themeColors?.secondary).toBe('#64748B'); // passed through
      expect(result.themeColors?.accent).toBe('#06B6D4'); // default
    });

    it('extracts fonts to load from theme', () => {
      const input: ThemeTransformInput = {
        apiTheme: mockApiTheme,
      };

      const fonts = extractFontsToLoad(input);

      expect(fonts).toContain('Montserrat');
      expect(fonts).toContain('Open Sans');
      expect(fonts.length).toBe(2);
    });

    it('returns unique fonts only', () => {
      const input: ThemeTransformInput = {
        apiTheme: {
          theme_id: 'test',
          typography: {
            heading_font: { family: 'Inter', source: 'web' },
            body_font: { family: 'Inter', source: 'web' },
            accent_font: { family: 'Inter', source: 'web' },
          },
        },
      };

      const fonts = extractFontsToLoad(input);

      expect(fonts).toEqual(['Inter']);
    });
  });

  describe('ProfileCard with Theme', () => {
    it('renders with theme colors applied', () => {
      const themeOutput = transformThemeForProfileCard({
        apiTheme: mockApiTheme,
      });

      render(
        <TestWrapper>
          <ProfileCard
            profile={mockProfile}
            themeColors={themeOutput.themeColors}
            themeTypography={themeOutput.themeTypography}
            themeLayout={themeOutput.themeLayout}
          />
        </TestWrapper>
      );

      // Card should render with profile data
      expect(screen.getByText('Test Company')).toBeInTheDocument();
      expect(screen.getByText('Your trusted partner')).toBeInTheDocument();
    });

    it('applies typography font family to headings', () => {
      const themeOutput = transformThemeForProfileCard({
        apiTheme: mockApiTheme,
      });

      const { container } = render(
        <TestWrapper>
          <ProfileCard
            profile={mockProfile}
            themeColors={themeOutput.themeColors}
            themeTypography={themeOutput.themeTypography}
          />
        </TestWrapper>
      );

      // Find heading and check font family
      const heading = screen.getByText('Test Company');
      const computedStyle = heading.getAttribute('style');
      expect(computedStyle).toContain('Montserrat');
    });

    it('uses compact spacing when layout.spacing is compact', () => {
      const input: ThemeTransformInput = {
        apiTheme: {
          ...mockApiTheme,
          layout: {
            spacing: 'compact',
            hero_style: 'card',
            section_layout: 'single-column',
          },
        },
      };

      const themeOutput = transformThemeForProfileCard(input);

      render(
        <TestWrapper>
          <ProfileCard
            profile={mockProfile}
            themeLayout={themeOutput.themeLayout}
          />
        </TestWrapper>
      );

      // The layout spacing should affect the rendering
      expect(themeOutput.themeLayout?.spacing).toBe('compact');
    });

    it('uses spacious spacing when layout.spacing is spacious', () => {
      const input: ThemeTransformInput = {
        apiTheme: {
          ...mockApiTheme,
          layout: {
            spacing: 'spacious',
            hero_style: 'full-bleed',
            section_layout: 'two-column',
          },
        },
      };

      const themeOutput = transformThemeForProfileCard(input);

      expect(themeOutput.themeLayout?.spacing).toBe('spacious');
      expect(themeOutput.themeLayout?.heroStyle).toBe('full-bleed');
      expect(themeOutput.themeLayout?.sectionLayout).toBe('two-column');
    });
  });

  describe('Theme with Customization Overrides', () => {
    it('applies custom color overrides on top of theme', () => {
      const input: ThemeTransformInput = {
        apiTheme: mockApiTheme,
        customization: {
          custom_colors: {
            primary: '#FF0000',
            secondary: '#00FF00',
          },
        },
      };

      const result = transformThemeForProfileCard(input);

      // Custom colors should override theme colors
      expect(result.themeColors?.primary).toBe('#FF0000');
      expect(result.themeColors?.secondary).toBe('#00FF00');
      // Accent should still come from theme (no override)
      expect(result.themeColors?.accent).toBe('#FBBF24');
    });

    it('applies custom typography overrides', () => {
      const input: ThemeTransformInput = {
        apiTheme: mockApiTheme,
        customization: {
          custom_typography: {
            heading_font: {
              family: 'Custom Font',
              source: 'web',
            },
          },
        },
      };

      const result = transformThemeForProfileCard(input);

      expect(result.themeTypography?.headingFont).toContain('Custom Font');
      // Body should still come from theme
      expect(result.themeTypography?.bodyFont).toContain('Open Sans');
    });
  });

  describe('Gradient Rendering', () => {
    it('generates correct gradient CSS from theme', () => {
      const input: ThemeTransformInput = {
        apiTheme: mockApiTheme,
      };

      const result = transformThemeForProfileCard(input);

      expect(result.backgroundGradient).toBeDefined();
      expect(result.backgroundGradient).toMatch(/linear-gradient\(135deg,/);
      expect(result.backgroundGradient).toContain('#F97316');
      expect(result.backgroundGradient).toContain('#FB923C');
      expect(result.backgroundGradient).toContain('#FBBF24');
    });

    it('generates radial gradient when type is radial', () => {
      const input: ThemeTransformInput = {
        apiTheme: {
          ...mockApiTheme,
          base_colors: {
            ...mockApiTheme.base_colors,
            gradients: [
              {
                name: 'radial-test',
                type: 'radial',
                stops: ['#FF0000', '#00FF00'],
              },
            ],
          },
        },
      };

      const result = transformThemeForProfileCard(input);

      expect(result.backgroundGradient).toMatch(/radial-gradient\(circle,/);
    });
  });

  describe('Dark Theme Variant', () => {
    it('transforms theme with dark variant colors', () => {
      const darkTheme: BackendThemeData = {
        theme_id: 'midnight-blue',
        name: 'Midnight Blue',
        category: 'modern',
        base_colors: {
          primary: '#3B82F6',
          secondary: '#1E3A8A',
          accent: '#60A5FA',
          background: '#0F172A',
          surface: '#1E293B',
          text: '#F8FAFC',
        },
        variants: [
          {
            variant_id: 'midnight-blue-dark',
            name: 'Dark',
            colors: {
              primary: '#60A5FA',
              background: '#020617',
              surface: '#0F172A',
              text: '#FFFFFF',
            },
          },
        ],
      };

      const input: ThemeTransformInput = {
        apiTheme: darkTheme,
      };

      const result = transformThemeForProfileCard(input);

      expect(result.themeColors?.primary).toBe('#3B82F6');
      expect(result.backgroundColor).toBe('#0F172A');
    });
  });
});

// =============================================================================
// Visual Parity Property Tests
// =============================================================================

describe('Theme Visual Parity', () => {
  it('editor theme and API theme produce same colors', () => {
    // Simulate editor theme format
    const editorTheme = {
      theme_id: 'test-theme',
      name: 'Test Theme',
      category: 'minimal' as const,
      is_premium: false,
      base_colors: {
        primary: '#2563EB',
        secondary: '#64748B',
        accent: '#06B6D4',
        background: '#FFFFFF',
        surface: '#F8FAFC',
        text: '#0F172A',
      },
      default_typography: {
        heading_font: { family: 'Inter', source: 'web' as const },
        body_font: { family: 'Inter', source: 'web' as const },
      },
      layout_config: {
        spacing: 'normal' as const,
        hero_style: 'card' as const,
        section_layout: 'single-column' as const,
      },
    };

    // Same data in API format
    const apiTheme: BackendThemeData = {
      theme_id: 'test-theme',
      name: 'Test Theme',
      category: 'minimal',
      base_colors: {
        primary: '#2563EB',
        secondary: '#64748B',
        accent: '#06B6D4',
        background: '#FFFFFF',
        surface: '#F8FAFC',
        text: '#0F172A',
      },
      typography: {
        heading_font: { family: 'Inter', source: 'web' },
        body_font: { family: 'Inter', source: 'web' },
      },
      layout: {
        spacing: 'normal',
        hero_style: 'card',
        section_layout: 'single-column',
      },
    };

    const editorResult = transformThemeForProfileCard({ editorTheme });
    const apiResult = transformThemeForProfileCard({ apiTheme });

    // Both should produce identical color outputs
    expect(editorResult.themeColors?.primary).toBe(apiResult.themeColors?.primary);
    expect(editorResult.themeColors?.secondary).toBe(apiResult.themeColors?.secondary);
    expect(editorResult.themeColors?.accent).toBe(apiResult.themeColors?.accent);

    // Both should produce same layout
    expect(editorResult.themeLayout?.spacing).toBe(apiResult.themeLayout?.spacing);
  });
});
