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
    animation_type: 'gradient-shift',
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
    animation_type: 'wave',
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
    animation_type: 'gradient-shift',
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
    animation_type: 'particles',
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
    animation_type: 'aurora',
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
    animation_type: 'gradient-shift',
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

  // ─────────────────────────────────────────────────────────────────────────
  // 7. GRADIENT THEME - Ocean Breeze
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-ocean-breeze',
    name: 'Ocean Breeze',
    category: 'gradient',
    animation_type: 'wave',
    description: 'Calming ocean-inspired gradient with teal and blue tones. Evokes tranquility and professionalism.',
    preview_image_url: '/themes/previews/ocean-breeze.webp',
    base_colors: {
      primary: '#0891B2',
      secondary: '#06B6D4',
      accent: '#22D3EE',
      neutral: ['#F0FDFA', '#CCFBF1', '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E', '#115E59', '#134E4A'],
      gradients: [
        {
          name: 'Ocean Wave',
          type: 'linear',
          direction: '135deg',
          stops: ['#0891B2', '#06B6D4', '#22D3EE'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Outfit',
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
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 720,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'ocean-breeze-light',
        name: 'Light',
        colors: {
          background: '#F0FDFA',
          surface: '#FFFFFF',
          text_primary: '#134E4A',
          text_secondary: '#0F766E',
        },
      },
      {
        variant_id: 'ocean-breeze-dark',
        name: 'Dark',
        colors: {
          background: '#042F2E',
          surface: '#134E4A',
          text_primary: '#F0FDFA',
          text_secondary: '#5EEAD4',
          glass: 'rgba(8, 145, 178, 0.1)',
          glass_border: 'rgba(34, 211, 238, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. GRADIENT THEME - Lavender Haze
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-lavender-haze',
    name: 'Lavender Haze',
    category: 'gradient',
    animation_type: 'particles',
    description: 'Soft purple gradient with dreamy, ethereal vibes. Perfect for creative and artistic profiles.',
    preview_image_url: '/themes/previews/lavender-haze.webp',
    base_colors: {
      primary: '#A855F7',
      secondary: '#C084FC',
      accent: '#E879F9',
      neutral: ['#FAF5FF', '#F3E8FF', '#E9D5FF', '#D8B4FE', '#C084FC', '#A855F7', '#9333EA', '#7C3AED', '#6D28D9', '#4C1D95'],
      gradients: [
        {
          name: 'Lavender Dream',
          type: 'linear',
          direction: '135deg',
          stops: ['#A855F7', '#C084FC', '#E879F9'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Quicksand',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Nunito',
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
    is_popular: false,
    usage_count: 380,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'lavender-haze-light',
        name: 'Light',
        colors: {
          background: '#FAF5FF',
          surface: '#FFFFFF',
          text_primary: '#4C1D95',
          text_secondary: '#7C3AED',
        },
      },
      {
        variant_id: 'lavender-haze-dark',
        name: 'Dark',
        colors: {
          background: '#1E1B4B',
          surface: '#312E81',
          text_primary: '#FAF5FF',
          text_secondary: '#C084FC',
          glass: 'rgba(168, 85, 247, 0.1)',
          glass_border: 'rgba(232, 121, 249, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. GRADIENT THEME - Sunset Glow
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-sunset-glow',
    name: 'Sunset Glow',
    category: 'gradient',
    animation_type: 'gradient-shift',
    description: 'Warm sunset gradient transitioning from coral to gold. Energetic and inviting.',
    preview_image_url: '/themes/previews/sunset-glow.webp',
    base_colors: {
      primary: '#F97316',
      secondary: '#FB923C',
      accent: '#FBBF24',
      neutral: ['#FFFBEB', '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309', '#92400E', '#78350F'],
      gradients: [
        {
          name: 'Sunset Blaze',
          type: 'linear',
          direction: '135deg',
          stops: ['#F97316', '#FB923C', '#FBBF24'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Rubik',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Open Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 650,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'sunset-glow-light',
        name: 'Light',
        colors: {
          background: '#FFFBEB',
          surface: '#FFFFFF',
          text_primary: '#78350F',
          text_secondary: '#92400E',
        },
      },
      {
        variant_id: 'sunset-glow-dark',
        name: 'Dark',
        colors: {
          background: '#451A03',
          surface: '#78350F',
          text_primary: '#FFFBEB',
          text_secondary: '#FDE68A',
          glass: 'rgba(249, 115, 22, 0.1)',
          glass_border: 'rgba(251, 191, 36, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. GRADIENT THEME - Forest Mist
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-forest-mist',
    name: 'Forest Mist',
    category: 'gradient',
    animation_type: 'particles',
    description: 'Natural green gradient inspired by forest landscapes. Calming and organic.',
    preview_image_url: '/themes/previews/forest-mist.webp',
    base_colors: {
      primary: '#059669',
      secondary: '#10B981',
      accent: '#34D399',
      neutral: ['#ECFDF5', '#D1FAE5', '#A7F3D0', '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857', '#065F46', '#064E3B'],
      gradients: [
        {
          name: 'Forest Canopy',
          type: 'linear',
          direction: '180deg',
          stops: ['#059669', '#10B981', '#34D399'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Josefin Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Lato',
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
    is_popular: false,
    usage_count: 290,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'forest-mist-light',
        name: 'Light',
        colors: {
          background: '#ECFDF5',
          surface: '#FFFFFF',
          text_primary: '#064E3B',
          text_secondary: '#047857',
        },
      },
      {
        variant_id: 'forest-mist-dark',
        name: 'Dark',
        colors: {
          background: '#022C22',
          surface: '#064E3B',
          text_primary: '#ECFDF5',
          text_secondary: '#6EE7B7',
          glass: 'rgba(5, 150, 105, 0.1)',
          glass_border: 'rgba(52, 211, 153, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. DARK THEME - Midnight Noir
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-midnight-noir',
    name: 'Midnight Noir',
    category: 'dark',
    animation_type: 'aurora',
    description: 'Deep dark theme with subtle blue undertones. Perfect for dramatic, cinematic portfolios.',
    preview_image_url: '/themes/previews/midnight-noir.webp',
    base_colors: {
      primary: '#3B82F6',
      secondary: '#60A5FA',
      accent: '#93C5FD',
      neutral: ['#0F172A', '#1E293B', '#334155', '#475569', '#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0', '#F1F5F9', '#F8FAFC'],
    },
    default_typography: {
      heading_font: {
        family: 'Bebas Neue',
        source: 'web',
        fallback: ['Impact', 'sans-serif'],
        weights: [400],
      },
      body_font: {
        family: 'Roboto',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: true,
    usage_count: 890,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'midnight-noir-dark',
        name: 'Dark',
        colors: {
          background: '#0F172A',
          surface: '#1E293B',
          text_primary: '#F8FAFC',
          text_secondary: '#94A3B8',
          glass: 'rgba(59, 130, 246, 0.1)',
          glass_border: 'rgba(147, 197, 253, 0.15)',
        },
      },
      {
        variant_id: 'midnight-noir-light',
        name: 'Light',
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          text_primary: '#0F172A',
          text_secondary: '#475569',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. DARK THEME - Carbon Pro
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-carbon-pro',
    name: 'Carbon Pro',
    category: 'dark',
    animation_type: 'aurora',
    description: 'Sleek carbon-inspired dark theme. High contrast for maximum readability and impact.',
    preview_image_url: '/themes/previews/carbon-pro.webp',
    base_colors: {
      primary: '#FFFFFF',
      secondary: '#A1A1AA',
      accent: '#F4F4F5',
      neutral: ['#09090B', '#18181B', '#27272A', '#3F3F46', '#52525B', '#71717A', '#A1A1AA', '#D4D4D8', '#E4E4E7', '#FAFAFA'],
    },
    default_typography: {
      heading_font: {
        family: 'JetBrains Mono',
        source: 'web',
        fallback: ['monospace'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'IBM Plex Sans',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'compact',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: false,
    usage_count: 450,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'carbon-pro-dark',
        name: 'Dark',
        colors: {
          background: '#09090B',
          surface: '#18181B',
          text_primary: '#FAFAFA',
          text_secondary: '#A1A1AA',
          glass: 'rgba(255, 255, 255, 0.05)',
          glass_border: 'rgba(255, 255, 255, 0.1)',
        },
      },
      {
        variant_id: 'carbon-pro-light',
        name: 'Light',
        colors: {
          background: '#FAFAFA',
          surface: '#FFFFFF',
          text_primary: '#09090B',
          text_secondary: '#52525B',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. NATURE THEME - Earth Tones
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-earth-tones',
    name: 'Earth Tones',
    category: 'nature',
    animation_type: 'particles',
    description: 'Warm, grounded color palette inspired by natural earth. Authentic and approachable.',
    preview_image_url: '/themes/previews/earth-tones.webp',
    base_colors: {
      primary: '#92400E',
      secondary: '#B45309',
      accent: '#D97706',
      neutral: ['#FFFBEB', '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309', '#92400E', '#78350F'],
    },
    default_typography: {
      heading_font: {
        family: 'Bitter',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Source Sans 3',
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
    is_popular: false,
    usage_count: 210,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'earth-tones-light',
        name: 'Light',
        colors: {
          background: '#FFFBEB',
          surface: '#FFFFFF',
          text_primary: '#78350F',
          text_secondary: '#92400E',
        },
      },
      {
        variant_id: 'earth-tones-dark',
        name: 'Dark',
        colors: {
          background: '#451A03',
          surface: '#78350F',
          text_primary: '#FFFBEB',
          text_secondary: '#FCD34D',
          glass: 'rgba(146, 64, 14, 0.1)',
          glass_border: 'rgba(217, 119, 6, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 14. ELEGANT THEME - Rose Gold
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-rose-gold',
    name: 'Rose Gold',
    category: 'elegant',
    animation_type: 'gradient-shift',
    description: 'Sophisticated rose gold accents with blush tones. Luxurious and feminine.',
    preview_image_url: '/themes/previews/rose-gold.webp',
    base_colors: {
      primary: '#BE185D',
      secondary: '#DB2777',
      accent: '#F472B6',
      neutral: ['#FDF2F8', '#FCE7F3', '#FBCFE8', '#F9A8D4', '#F472B6', '#EC4899', '#DB2777', '#BE185D', '#9D174D', '#831843'],
      gradients: [
        {
          name: 'Rose Shimmer',
          type: 'linear',
          direction: '135deg',
          stops: ['#BE185D', '#DB2777', '#F472B6'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Cormorant Garamond',
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
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: true,
    usage_count: 560,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'rose-gold-light',
        name: 'Light',
        colors: {
          background: '#FDF2F8',
          surface: '#FFFFFF',
          text_primary: '#831843',
          text_secondary: '#9D174D',
        },
      },
      {
        variant_id: 'rose-gold-dark',
        name: 'Dark',
        colors: {
          background: '#500724',
          surface: '#831843',
          text_primary: '#FDF2F8',
          text_secondary: '#F9A8D4',
          glass: 'rgba(190, 24, 93, 0.1)',
          glass_border: 'rgba(244, 114, 182, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 15. BOLD THEME - Electric Pop
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-electric-pop',
    name: 'Electric Pop',
    category: 'bold',
    animation_type: 'wave',
    description: 'High-energy electric colors that demand attention. For those who want to stand out.',
    preview_image_url: '/themes/previews/electric-pop.webp',
    base_colors: {
      primary: '#7C3AED',
      secondary: '#8B5CF6',
      accent: '#A78BFA',
      neutral: ['#F5F3FF', '#EDE9FE', '#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
      gradients: [
        {
          name: 'Electric Surge',
          type: 'linear',
          direction: '45deg',
          stops: ['#7C3AED', '#EC4899', '#F59E0B'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Archivo Black',
        source: 'web',
        fallback: ['Impact', 'sans-serif'],
        weights: [400],
      },
      body_font: {
        family: 'Barlow',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: false,
    usage_count: 340,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'electric-pop-light',
        name: 'Light',
        colors: {
          background: '#F5F3FF',
          surface: '#FFFFFF',
          text_primary: '#4C1D95',
          text_secondary: '#6D28D9',
        },
      },
      {
        variant_id: 'electric-pop-dark',
        name: 'Dark',
        colors: {
          background: '#1E1B4B',
          surface: '#312E81',
          text_primary: '#F5F3FF',
          text_secondary: '#A78BFA',
          glass: 'rgba(124, 58, 237, 0.15)',
          glass_border: 'rgba(167, 139, 250, 0.25)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 16. MINIMAL THEME - Paper White
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-paper-white',
    name: 'Paper White',
    category: 'minimal',
    animation_type: 'gradient-shift',
    description: 'Ultra-clean white design with subtle shadows. Maximum focus on content.',
    preview_image_url: '/themes/previews/paper-white.webp',
    base_colors: {
      primary: '#374151',
      secondary: '#6B7280',
      accent: '#111827',
      neutral: ['#FFFFFF', '#F9FAFB', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563', '#374151', '#1F2937'],
    },
    default_typography: {
      heading_font: {
        family: 'Libre Baskerville',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 700],
      },
      body_font: {
        family: 'Source Serif 4',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: false,
    usage_count: 180,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'paper-white-light',
        name: 'Light',
        colors: {
          background: '#FFFFFF',
          surface: '#F9FAFB',
          text_primary: '#1F2937',
          text_secondary: '#4B5563',
        },
      },
      {
        variant_id: 'paper-white-dark',
        name: 'Dark',
        colors: {
          background: '#111827',
          surface: '#1F2937',
          text_primary: '#F9FAFB',
          text_secondary: '#9CA3AF',
          glass: 'rgba(255, 255, 255, 0.03)',
          glass_border: 'rgba(255, 255, 255, 0.08)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 17. MODERN THEME - Slate Pro
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-slate-pro',
    name: 'Slate Pro',
    category: 'modern',
    animation_type: 'particles',
    description: 'Professional slate gray palette. Clean and corporate-friendly.',
    preview_image_url: '/themes/previews/slate-pro.webp',
    base_colors: {
      primary: '#475569',
      secondary: '#64748B',
      accent: '#0EA5E9',
      neutral: ['#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A'],
    },
    default_typography: {
      heading_font: {
        family: 'Figtree',
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
      spacing: 'normal',
      hero_style: 'card',
      section_layout: 'two-column',
    },
    is_premium: false,
    is_popular: false,
    usage_count: 420,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'slate-pro-light',
        name: 'Light',
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          text_primary: '#0F172A',
          text_secondary: '#475569',
        },
      },
      {
        variant_id: 'slate-pro-dark',
        name: 'Dark',
        colors: {
          background: '#0F172A',
          surface: '#1E293B',
          text_primary: '#F8FAFC',
          text_secondary: '#94A3B8',
          glass: 'rgba(14, 165, 233, 0.1)',
          glass_border: 'rgba(14, 165, 233, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 18. CREATIVE THEME - Cosmic Purple
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-cosmic-purple',
    name: 'Cosmic Purple',
    category: 'creative',
    animation_type: 'aurora',
    description: 'Deep cosmic purples with stellar accents. For creative visionaries.',
    preview_image_url: '/themes/previews/cosmic-purple.webp',
    base_colors: {
      primary: '#6D28D9',
      secondary: '#7C3AED',
      accent: '#C084FC',
      neutral: ['#FAF5FF', '#F3E8FF', '#E9D5FF', '#D8B4FE', '#C084FC', '#A855F7', '#9333EA', '#7C3AED', '#6D28D9', '#5B21B6'],
      gradients: [
        {
          name: 'Nebula',
          type: 'linear',
          direction: '135deg',
          stops: ['#6D28D9', '#9333EA', '#EC4899'],
        },
      ],
    },
    default_typography: {
      heading_font: {
        family: 'Orbitron',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Exo 2',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'full-bleed',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: false,
    usage_count: 280,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'cosmic-purple-light',
        name: 'Light',
        colors: {
          background: '#FAF5FF',
          surface: '#FFFFFF',
          text_primary: '#5B21B6',
          text_secondary: '#7C3AED',
        },
      },
      {
        variant_id: 'cosmic-purple-dark',
        name: 'Dark',
        colors: {
          background: '#1E1B4B',
          surface: '#312E81',
          text_primary: '#FAF5FF',
          text_secondary: '#C084FC',
          glass: 'rgba(109, 40, 217, 0.15)',
          glass_border: 'rgba(192, 132, 252, 0.25)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 19. ELEGANT THEME - Champagne
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-champagne',
    name: 'Champagne',
    category: 'elegant',
    animation_type: 'gradient-shift',
    description: 'Luxurious champagne and cream tones. Celebratory and refined.',
    preview_image_url: '/themes/previews/champagne.webp',
    base_colors: {
      primary: '#A16207',
      secondary: '#CA8A04',
      accent: '#EAB308',
      neutral: ['#FEFCE8', '#FEF9C3', '#FEF08A', '#FDE047', '#FACC15', '#EAB308', '#CA8A04', '#A16207', '#854D0E', '#713F12'],
    },
    default_typography: {
      heading_font: {
        family: 'Cinzel',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'EB Garamond',
        source: 'web',
        fallback: ['Georgia', 'serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'spacious',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: true,
    is_popular: false,
    usage_count: 190,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'champagne-light',
        name: 'Light',
        colors: {
          background: '#FEFCE8',
          surface: '#FFFFFF',
          text_primary: '#713F12',
          text_secondary: '#854D0E',
        },
      },
      {
        variant_id: 'champagne-dark',
        name: 'Dark',
        colors: {
          background: '#422006',
          surface: '#713F12',
          text_primary: '#FEFCE8',
          text_secondary: '#FDE047',
          glass: 'rgba(161, 98, 7, 0.1)',
          glass_border: 'rgba(234, 179, 8, 0.2)',
        },
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 20. NATURE THEME - Sky Blue
  // ─────────────────────────────────────────────────────────────────────────
  {
    theme_id: 'theme-sky-blue',
    name: 'Sky Blue',
    category: 'nature',
    animation_type: 'wave',
    description: 'Clear sky blues evoking openness and trust. Fresh and optimistic.',
    preview_image_url: '/themes/previews/sky-blue.webp',
    base_colors: {
      primary: '#0284C7',
      secondary: '#0EA5E9',
      accent: '#38BDF8',
      neutral: ['#F0F9FF', '#E0F2FE', '#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1', '#075985', '#0C4A6E'],
    },
    default_typography: {
      heading_font: {
        family: 'Montserrat',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500, 600, 700],
      },
      body_font: {
        family: 'Hind',
        source: 'web',
        fallback: ['system-ui', 'sans-serif'],
        weights: [400, 500],
      },
    },
    layout_config: {
      spacing: 'normal',
      hero_style: 'card',
      section_layout: 'single-column',
    },
    is_premium: false,
    is_popular: false,
    usage_count: 360,
    supports_dark_mode: true,
    variants: [
      {
        variant_id: 'sky-blue-light',
        name: 'Light',
        colors: {
          background: '#F0F9FF',
          surface: '#FFFFFF',
          text_primary: '#0C4A6E',
          text_secondary: '#075985',
        },
      },
      {
        variant_id: 'sky-blue-dark',
        name: 'Dark',
        colors: {
          background: '#082F49',
          surface: '#0C4A6E',
          text_primary: '#F0F9FF',
          text_secondary: '#7DD3FC',
          glass: 'rgba(2, 132, 199, 0.1)',
          glass_border: 'rgba(56, 189, 248, 0.2)',
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
    gradient: 0,
    dark: 0,
    nature: 0,
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
  gradient: {
    label: 'Gradient',
    description: 'Smooth color transitions and flowing backgrounds',
    icon: 'rainbow',
  },
  dark: {
    label: 'Dark',
    description: 'Dramatic dark themes for striking visuals',
    icon: 'moon',
  },
  nature: {
    label: 'Nature',
    description: 'Earth-inspired colors and organic aesthetics',
    icon: 'leaf',
  },
};
