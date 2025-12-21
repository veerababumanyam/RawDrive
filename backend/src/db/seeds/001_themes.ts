/**
 * Theme Seed Data
 *
 * Pre-built modern themes for the Public Profile Editor.
 * Provides 6+ professionally designed themes across 5 categories:
 * minimal, bold, elegant, modern, creative
 *
 * Requirements: 3.1, 3.3, 3.6
 */

import type { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Types
// =============================================================================

interface GradientConfig {
  name: string;
  type: 'linear' | 'radial';
  direction?: string;
  stops: string[];
}

interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string[];
  gradients?: GradientConfig[];
}

interface FontConfig {
  family: string;
  source: 'web' | 'custom';
  fallback: string[];
  weights: number[];
}

interface TypographyConfig {
  heading_font: FontConfig;
  body_font: FontConfig;
  accent_font?: FontConfig;
}

interface LayoutPreferences {
  spacing: 'compact' | 'normal' | 'spacious';
  hero_style: 'card' | 'full-bleed';
  section_layout: 'single-column' | 'two-column';
}

interface ThemeVariant {
  variant_id: string;
  name: string;
  colors: {
    background: string;
    surface: string;
    text_primary: string;
    text_secondary: string;
    glass?: string;
    glass_border?: string;
  };
}

interface ThemeSeedData {
  theme_id: string;
  name: string;
  category: 'minimal' | 'bold' | 'elegant' | 'modern' | 'creative';
  description: string;
  preview_image_url: string;
  base_colors: ColorPalette;
  default_typography: TypographyConfig;
  layout_config: LayoutPreferences;
  is_premium: boolean;
  is_popular: boolean;
  usage_count: number;
  supports_dark_mode: boolean;
  variants: ThemeVariant[];
}

// =============================================================================
// Theme Definitions
// =============================================================================

export const SEED_THEMES: ThemeSeedData[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. MINIMAL THEME - Clean and Sophisticated
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#FFFFFF',
          surface: '#FAFAFA',
          text_primary: '#1A1A1A',
          text_secondary: '#6B7280',
        },
      },
      {
        variant_id: uuidv4(),
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. BOLD THEME - Vibrant and Energetic
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#FFFBEB',
          surface: '#FFFFFF',
          text_primary: '#1F2937',
          text_secondary: '#4B5563',
        },
      },
      {
        variant_id: uuidv4(),
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ELEGANT THEME - Luxurious and Refined
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#FFFDF7',
          surface: '#FFFFFF',
          text_primary: '#1A1512',
          text_secondary: '#6B5B4B',
        },
      },
      {
        variant_id: uuidv4(),
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. MODERN THEME - Contemporary and Professional
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          text_primary: '#0F172A',
          text_secondary: '#64748B',
        },
      },
      {
        variant_id: uuidv4(),
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. CREATIVE THEME - Artistic and Expressive
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#FAF5FF',
          surface: '#FFFFFF',
          text_primary: '#1E1B4B',
          text_secondary: '#6B21A8',
        },
      },
      {
        variant_id: uuidv4(),
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
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. MINIMAL THEME - Monochrome Focus
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: uuidv4(),
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
    usage_count: 0,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: uuidv4(),
        name: 'Light',
        colors: {
          background: '#FFFFFF',
          surface: '#FAFAFA',
          text_primary: '#000000',
          text_secondary: '#525252',
        },
      },
      {
        variant_id: uuidv4(),
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
  },
];

// =============================================================================
// Seed Functions
// =============================================================================

/**
 * Seed themes into the database
 */
export async function seedThemes(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const theme of SEED_THEMES) {
      // Insert theme
      await client.query(
        `INSERT INTO themes (
          theme_id, name, category, description, preview_image_url,
          base_colors, default_typography, layout_config,
          is_premium, is_popular, usage_count, supports_dark_mode,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT (theme_id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          preview_image_url = EXCLUDED.preview_image_url,
          base_colors = EXCLUDED.base_colors,
          default_typography = EXCLUDED.default_typography,
          layout_config = EXCLUDED.layout_config,
          is_premium = EXCLUDED.is_premium,
          is_popular = EXCLUDED.is_popular,
          supports_dark_mode = EXCLUDED.supports_dark_mode,
          updated_at = NOW()`,
        [
          theme.theme_id,
          theme.name,
          theme.category,
          theme.description,
          theme.preview_image_url,
          JSON.stringify(theme.base_colors),
          JSON.stringify(theme.default_typography),
          JSON.stringify(theme.layout_config),
          theme.is_premium,
          theme.is_popular,
          theme.usage_count,
          theme.supports_dark_mode,
        ]
      );

      // Insert theme variants
      for (const variant of theme.variants) {
        await client.query(
          `INSERT INTO theme_variants (
            variant_id, theme_id, name, colors, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (variant_id) DO UPDATE SET
            name = EXCLUDED.name,
            colors = EXCLUDED.colors`,
          [
            variant.variant_id,
            theme.theme_id,
            variant.name,
            JSON.stringify(variant.colors),
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Successfully seeded ${SEED_THEMES.length} themes`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding themes:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove all seeded themes from the database
 */
export async function unseedThemes(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const themeIds = SEED_THEMES.map((t) => t.theme_id);

    // Delete variants first (foreign key)
    await client.query(
      'DELETE FROM theme_variants WHERE theme_id = ANY($1)',
      [themeIds]
    );

    // Delete themes
    await client.query('DELETE FROM themes WHERE theme_id = ANY($1)', [
      themeIds,
    ]);

    await client.query('COMMIT');
    console.log(`Successfully removed ${SEED_THEMES.length} themes`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing themes:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default { seedThemes, unseedThemes, SEED_THEMES };
