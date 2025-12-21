/**
 * Pre-built Theme Constants
 *
 * Static theme data for the Public Profile Editor.
 * These themes are available by default and can be customized by users.
 *
 * Requirements: 3.1, 3.3, 3.6
 */

import type { Theme, ThemeCategory } from '@/types/profileEditor';

// =============================================================================
// Theme Definitions
// =============================================================================

/**
 * All pre-built themes available in the system
 */
export const PREBUILT_THEMES: Theme[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. MINIMAL THEME - Clean and Sophisticated
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-clean-slate',
    name: 'Clean Slate',
    category: 'minimal',
    description: 'A refined, minimalist design with ample white space and subtle accents. Perfect for photographers who want their work to speak for itself.',
    preview_image_url: '/themes/previews/clean-slate.webp',
    base_colors: {
      primary: '#1A1A1A',
      secondary: '#6B7280',
      accent: '#3B82F6',
      neutral: ['#FFFFFF', '#FAFAFA', '#F5F5F5', '#E5E5E5', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#404040', '#262626'],
      gradients: [
        {
          name: 'Subtle Fade',
          type: 'linear',
          direction: '180deg',
          stops: ['#FFFFFF', '#FAFAFA'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Inter',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Inter',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 1250,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'clean-slate-light',
        name: 'Light',
        colors: {
          background: '#FFFFFF',
          surface: '#FAFAFA',
          text_primary: '#1A1A1A',
          text_secondary: '#6B7280',
        },
      },
      {
        variant_id: 'clean-slate-dark',
        name: 'Dark',
        colors: {
          background: '#0F0F0F',
          surface: '#1A1A1A',
          text_primary: '#FFFFFF',
          text_secondary: '#A3A3A3',
          glass: 'rgba(255, 255, 255, 0.05)',
          glass_border: 'rgba(255, 255, 255, 0.1)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. BOLD THEME - Vibrant and Energetic
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-vivid-impact',
    name: 'Vivid Impact',
    category: 'bold',
    description: 'Make a statement with bold colors and strong typography. Ideal for creative professionals who want to stand out.',
    preview_image_url: '/themes/previews/vivid-impact.webp',
    base_colors: {
      primary: '#EF4444',
      secondary: '#F97316',
      accent: '#FCD34D',
      neutral: ['#FFFBEB', '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309', '#92400E', '#78350F'],
      gradients: [
        {
          name: 'Sunset Blaze',
          type: 'linear',
          direction: '135deg',
          stops: ['#EF4444', '#F97316', '#FCD34D'],
        },
        {
          name: 'Fire Ring',
          type: 'radial',
          stops: ['#FCD34D', '#F97316', '#EF4444'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Poppins',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [500, 600, 700, 800],
      },
      body_font: {
        family: 'Poppins',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
      accent_font: {
        family: 'DM Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [500, 700],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 980,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'vivid-impact-light',
        name: 'Light',
        colors: {
          background: '#FFFBEB',
          surface: '#FFFFFF',
          text_primary: '#1F2937',
          text_secondary: '#4B5563',
        },
      },
      {
        variant_id: 'vivid-impact-dark',
        name: 'Dark',
        colors: {
          background: '#1C1917',
          surface: '#292524',
          text_primary: '#FFFFFF',
          text_secondary: '#D6D3D1',
          glass: 'rgba(234, 88, 12, 0.1)',
          glass_border: 'rgba(251, 191, 36, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ELEGANT THEME - Luxurious and Refined
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-golden-hour',
    name: 'Golden Hour',
    category: 'elegant',
    description: 'Sophisticated design with gold accents and serif typography. Perfect for wedding and portrait photographers seeking a premium feel.',
    preview_image_url: '/themes/previews/golden-hour.webp',
    base_colors: {
      primary: '#B8860B',
      secondary: '#8B7355',
      accent: '#D4AF37',
      neutral: ['#FFFDF7', '#FDF6E3', '#F5ECDC', '#E8DCC8', '#D4C8B4', '#9C8C7C', '#6B5B4B', '#4A3F35', '#332B23', '#1A1512'],
      gradients: [
        {
          name: 'Golden Glow',
          type: 'linear',
          direction: '135deg',
          stops: ['#D4AF37', '#B8860B', '#8B7355'],
        },
        {
          name: 'Champagne',
          type: 'linear',
          direction: '180deg',
          stops: ['#FFFDF7', '#FDF6E3'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Playfair Display',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Lora',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500],
      },
      accent_font: {
        family: 'Cormorant Garamond',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500, 600],
      },
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: true,
    usage_count: 850,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'golden-hour-light',
        name: 'Light',
        colors: {
          background: '#FFFDF7',
          surface: '#FFFFFF',
          text_primary: '#1A1512',
          text_secondary: '#6B5B4B',
        },
      },
      {
        variant_id: 'golden-hour-dark',
        name: 'Dark',
        colors: {
          background: '#1A1512',
          surface: '#252019',
          text_primary: '#FFFDF7',
          text_secondary: '#D4C8B4',
          glass: 'rgba(212, 175, 55, 0.08)',
          glass_border: 'rgba(212, 175, 55, 0.15)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. MODERN THEME - Contemporary and Professional
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-tech-forward',
    name: 'Tech Forward',
    category: 'modern',
    description: 'A sleek, contemporary design with cool tones and geometric elements. Ideal for commercial and corporate photography.',
    preview_image_url: '/themes/previews/tech-forward.webp',
    base_colors: {
      primary: '#2563EB',
      secondary: '#0EA5E9',
      accent: '#06B6D4',
      neutral: ['#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A'],
      gradients: [
        {
          name: 'Ocean Depth',
          type: 'linear',
          direction: '135deg',
          stops: ['#2563EB', '#0EA5E9', '#06B6D4'],
        },
        {
          name: 'Frost',
          type: 'linear',
          direction: '180deg',
          stops: ['#F8FAFC', '#E2E8F0'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Plus Jakarta Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [500, 600, 700, 800],
      },
      body_font: {
        family: 'Inter',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'card',
      section_layout: 'two-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 1100,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'tech-forward-light',
        name: 'Light',
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          text_primary: '#0F172A',
          text_secondary: '#64748B',
        },
      },
      {
        variant_id: 'tech-forward-dark',
        name: 'Dark',
        colors: {
          background: '#0F172A',
          surface: '#1E293B',
          text_primary: '#F8FAFC',
          text_secondary: '#94A3B8',
          glass: 'rgba(37, 99, 235, 0.1)',
          glass_border: 'rgba(6, 182, 212, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. CREATIVE THEME - Artistic and Expressive
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-aurora-dreams',
    name: 'Aurora Dreams',
    category: 'creative',
    description: 'An artistic theme with vibrant gradients and expressive typography. Perfect for avant-garde and fine art photographers.',
    preview_image_url: '/themes/previews/aurora-dreams.webp',
    base_colors: {
      primary: '#8B5CF6',
      secondary: '#EC4899',
      accent: '#06B6D4',
      neutral: ['#FAF5FF', '#F3E8FF', '#E9D5FF', '#D8B4FE', '#C084FC', '#A855F7', '#9333EA', '#7C3AED', '#6D28D9', '#5B21B6'],
      gradients: [
        {
          name: 'Northern Lights',
          type: 'linear',
          direction: '135deg',
          stops: ['#8B5CF6', '#EC4899', '#06B6D4'],
        },
        {
          name: 'Cosmic',
          type: 'radial',
          stops: ['#FAF5FF', '#E9D5FF', '#C084FC'],
        },
        {
          name: 'Nebula',
          type: 'linear',
          direction: '45deg',
          stops: ['#5B21B6', '#8B5CF6', '#EC4899'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Space Grotesk',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'DM Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
      accent_font: {
        family: 'Crimson Pro',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500, 600],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: false,
    usage_count: 420,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'aurora-dreams-light',
        name: 'Light',
        colors: {
          background: '#FAF5FF',
          surface: '#FFFFFF',
          text_primary: '#1E1B4B',
          text_secondary: '#6B21A8',
        },
      },
      {
        variant_id: 'aurora-dreams-dark',
        name: 'Dark',
        colors: {
          background: '#0F0D1A',
          surface: '#1A1625',
          text_primary: '#FAF5FF',
          text_secondary: '#C084FC',
          glass: 'rgba(139, 92, 246, 0.1)',
          glass_border: 'rgba(236, 72, 153, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. MINIMAL THEME - Monochrome Focus
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-monochrome',
    name: 'Monochrome',
    category: 'minimal',
    description: 'Pure black and white design that puts all focus on your photography. Timeless and universally appealing.',
    preview_image_url: '/themes/previews/monochrome.webp',
    base_colors: {
      primary: '#000000',
      secondary: '#404040',
      accent: '#FFFFFF',
      neutral: ['#FFFFFF', '#FAFAFA', '#F5F5F5', '#E5E5E5', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#404040', '#000000'],
    },
    default_typography: {
      heading_font: {
        family: 'Instrument Serif',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400],
      },
      body_font: {
        family: 'Source Sans 3',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600],
      },
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: false,
    usage_count: 320,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'monochrome-light',
        name: 'Light',
        colors: {
          background: '#FFFFFF',
          surface: '#FAFAFA',
          text_primary: '#000000',
          text_secondary: '#525252',
        },
      },
      {
        variant_id: 'monochrome-dark',
        name: 'Dark',
        colors: {
          background: '#000000',
          surface: '#171717',
          text_primary: '#FFFFFF',
          text_secondary: '#A3A3A3',
          glass: 'rgba(255, 255, 255, 0.03)',
          glass_border: 'rgba(255, 255, 255, 0.08)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all themes
 */
export function getAllThemes(): Theme[] {
  return PREBUILT_THEMES;
}

/**
 * Get theme by ID
 */
export function getThemeById(themeId: string): Theme | undefined {
  return PREBUILT_THEMES.find((theme) => theme.theme_id === themeId);
}

/**
 * Get themes by category
 */
export function getThemesByCategory(category: ThemeCategory): Theme[] {
  return PREBUILT_THEMES.filter((theme) => theme.category === category);
}

/**
 * Get popular themes
 */
export function getPopularThemes(): Theme[] {
  return PREBUILT_THEMES.filter((theme) => theme.is_popular);
}

/**
 * Get premium themes
 */
export function getPremiumThemes(): Theme[] {
  return PREBUILT_THEMES.filter((theme) => theme.is_premium);
}

/**
 * Get free themes
 */
export function getFreeThemes(): Theme[] {
  return PREBUILT_THEMES.filter((theme) => !theme.is_premium);
}

/**
 * Get themes sorted by usage
 */
export function getThemesByUsage(): Theme[] {
  return [...PREBUILT_THEMES].sort((a, b) => b.usage_count - a.usage_count);
}

/**
 * Search themes by name or description
 */
export function searchThemes(query: string): Theme[] {
  const lowerQuery = query.toLowerCase();
  return PREBUILT_THEMES.filter(
    (theme) =>
      theme.name.toLowerCase().includes(lowerQuery) ||
      theme.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get default theme (first popular free theme)
 */
export function getDefaultTheme(): Theme {
  const defaultTheme = PREBUILT_THEMES.find((t) => t.is_popular && !t.is_premium);
  return defaultTheme || PREBUILT_THEMES[0];
}

/**
 * Get all theme categories with counts
 */
export function getThemeCategoryCounts(): Record<ThemeCategory, number> {
  const counts: Record<ThemeCategory, number> = {
    minimal: 0,
    bold: 0,
    elegant: 0,
    modern: 0,
    creative: 0,
  };

  for (const theme of PREBUILT_THEMES) {
    counts[theme.category]++;
  }

  return counts;
}

// =============================================================================
// Category Metadata
// =============================================================================

/**
 * Theme category display information
 */
export const THEME_CATEGORY_INFO: Record<
  ThemeCategory,
  { label: string; description: string; icon: string }
> = {
  minimal: {
    label: 'Minimal',
    description: 'Clean, focused designs with ample white space',
    icon: 'layout',
  },
  bold: {
    label: 'Bold',
    description: 'Vibrant colors and strong visual impact',
    icon: 'zap',
  },
  elegant: {
    label: 'Elegant',
    description: 'Sophisticated designs with premium aesthetics',
    icon: 'sparkles',
  },
  modern: {
    label: 'Modern',
    description: 'Contemporary styles with clean lines',
    icon: 'triangle',
  },
  creative: {
    label: 'Creative',
    description: 'Artistic and expressive visual styles',
    icon: 'palette',
  },
};
