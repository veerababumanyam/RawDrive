import { BackgroundTheme } from '../../../types/personalProfile';
import { PREBUILT_THEMES } from '../../../constants/themes';

export interface ProfileTheme {
    id: string | BackgroundTheme;
    name: string;
    colors: {
        background: string;
        text: string;
        textSecondary: string;
        accent: string;
        surface: string;
        border: string;
        primaryButton: string;
        primaryButtonText: string;
        secondaryButton: string;
        secondaryButtonText: string;
    };
    colorValues: {
        background: string;
        text: string;
        textSecondary: string;
        accent: string;
        surface: string;
        border: string;
    };
    typography: {
        headingFont: string;
        bodyFont: string;
    };
    effects: {
        glassmorphism: boolean;
        blur: string;
        shadow: string;
        radius: string;
    };
}

// Legacy theme mappings for backwards compatibility with old theme IDs
export const LEGACY_PROFILE_THEMES: Record<string, ProfileTheme> = {
    minimal: {
        id: 'minimal',
        name: 'Minimalist',
        colors: {
            background: 'bg-[var(--theme-bg)]',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-[var(--theme-accent)]',
            primaryButtonText: 'text-white',
            secondaryButton: 'bg-white',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: '#FFFFFF',
            text: '#18181B',
            textSecondary: '#71717A',
            accent: '#18181B',
            surface: '#FAFAFA',
            border: '#E4E4E7',
        },
        typography: {
            headingFont: 'font-sans',
            bodyFont: 'font-sans',
        },
        effects: {
            glassmorphism: false,
            blur: 'none',
            shadow: 'shadow-sm',
            radius: 'rounded-xl',
        },
    },
    dark: {
        id: 'dark',
        name: 'Midnight Pro',
        colors: {
            background: 'bg-[var(--theme-bg)]',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-[var(--theme-text)]',
            primaryButtonText: 'text-[var(--theme-bg)]',
            secondaryButton: 'bg-[var(--theme-accent)]/10',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: '#000000',
            text: '#FFFFFF',
            textSecondary: '#A1A1A1',
            accent: '#3B82F6',
            surface: '#18181B',
            border: '#FFFFFF',
        },
        typography: {
            headingFont: 'font-sans tracking-tight font-semibold',
            bodyFont: 'font-sans',
        },
        effects: {
            glassmorphism: true,
            blur: 'backdrop-blur-xl',
            shadow: 'shadow-2xl shadow-black/50',
            radius: 'rounded-[2rem]',
        },
    },
    pastel: {
        id: 'pastel',
        name: 'Soft Touch',
        colors: {
            background: 'bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-[var(--theme-text)]',
            primaryButtonText: 'text-white',
            secondaryButton: 'bg-white/50',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: '#F8F1F5',
            text: '#1E293B',
            textSecondary: '#64748B',
            accent: '#4F46E5',
            surface: '#FFFFFF',
            border: '#E2E8F0',
        },
        typography: {
            headingFont: 'font-serif',
            bodyFont: 'font-sans',
        },
        effects: {
            glassmorphism: true,
            blur: 'backdrop-blur-xl',
            shadow: 'shadow-lg shadow-indigo-500/5',
            radius: 'rounded-2xl',
        },
    },
    bold: {
        id: 'bold',
        name: 'Vibrant',
        colors: {
            background: 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-white',
            primaryButtonText: 'text-violet-700',
            secondaryButton: 'bg-white/10',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: '#A855F7',
            text: '#FFFFFF',
            textSecondary: '#F5F5F5',
            accent: '#FBBF24',
            surface: '#FFFFFF',
            border: '#FFFFFF',
        },
        typography: {
            headingFont: 'font-sans tracking-tight',
            bodyFont: 'font-medium',
        },
        effects: {
            glassmorphism: true,
            blur: 'backdrop-blur-md',
            shadow: 'shadow-xl',
            radius: 'rounded-3xl',
        },
    },
    cinematic: {
        id: 'cinematic',
        name: 'Cinema',
        colors: {
            background: 'bg-gradient-to-b from-neutral-900 to-black',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-[var(--theme-text)]',
            primaryButtonText: 'text-black',
            secondaryButton: 'bg-[var(--theme-surface)]',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: '#1A1A1A',
            text: '#F4F1DE',
            textSecondary: '#A8A8A8',
            accent: '#F59E0B',
            surface: '#2B2B2B',
            border: '#FFFFFF',
        },
        typography: {
            headingFont: 'font-serif tracking-widest uppercase',
            bodyFont: 'font-sans',
        },
        effects: {
            glassmorphism: true,
            blur: 'backdrop-blur-sm',
            shadow: 'shadow-2xl shadow-black',
            radius: 'rounded-none',
        },
    },
};

/**
 * Get theme configuration by ID.
 * Maps new theme IDs from PREBUILT_THEMES to ProfileTheme format.
 * Falls back to predefined themes for backwards compatibility.
 */
export function getTheme(themeId?: BackgroundTheme): ProfileTheme {
    // Try to find in legacy themes first (backwards compatibility)
    if (themeId && themeId in LEGACY_PROFILE_THEMES) {
        return LEGACY_PROFILE_THEMES[themeId];
    }

    // Look up in PREBUILT_THEMES and map to ProfileTheme
    if (themeId) {
        const builtInTheme = PREBUILT_THEMES.find((t) => t.theme_id === themeId);
        if (builtInTheme) {
            return convertBuiltInThemeToProfileTheme(builtInTheme);
        }
    }

    // Default fallback to Clean Slate theme
    const defaultTheme = PREBUILT_THEMES.find((t) => t.theme_id === 'theme-clean-slate');
    if (defaultTheme) {
        return convertBuiltInThemeToProfileTheme(defaultTheme);
    }

    // Ultimate fallback
    return LEGACY_PROFILE_THEMES.minimal;
}

/**
 * Converts a built-in theme to ProfileTheme format for rendering.
 * Uses CSS custom properties for dynamic color values instead of Tailwind arbitrary values.
 */
function convertBuiltInThemeToProfileTheme(theme: typeof PREBUILT_THEMES[0]): ProfileTheme {
    const primaryColor = theme.base_colors.primary;
    const accentColor = theme.base_colors.accent;
    const firstVariant = theme.variants?.[0];
    const bgColor = firstVariant?.colors.background || '#FFFFFF';
    const textColor = firstVariant?.colors.text_primary || '#000000';
    const secondaryText = firstVariant?.colors.text_secondary || '#6B7280';
    const surfaceColor = firstVariant?.colors.surface || bgColor;
    const borderColor = firstVariant?.colors.glass_border || primaryColor;

    return {
        id: theme.theme_id as BackgroundTheme,
        name: theme.name,
        colors: {
            background: 'bg-[var(--theme-bg)]',
            text: 'text-[var(--theme-text)]',
            textSecondary: 'text-[var(--theme-text-secondary)]',
            accent: 'text-[var(--theme-accent)]',
            surface: 'bg-[var(--theme-surface)]',
            border: 'border-[var(--theme-border)]',
            primaryButton: 'bg-[var(--theme-accent)]',
            primaryButtonText: 'text-white',
            secondaryButton: 'bg-[var(--theme-primary)]/10',
            secondaryButtonText: 'text-[var(--theme-text)]',
        },
        colorValues: {
            background: bgColor,
            text: textColor,
            textSecondary: secondaryText,
            accent: accentColor,
            surface: surfaceColor,
            border: borderColor,
        },
        typography: {
            headingFont: theme.default_typography.heading_font.family || 'font-sans',
            bodyFont: theme.default_typography.body_font.family || 'font-sans',
        },
        effects: {
            glassmorphism: theme.category === 'gradient' || theme.category === 'modern',
            blur: theme.category === 'gradient' ? 'backdrop-blur-md' : 'backdrop-blur-none',
            shadow: 'shadow-lg',
            radius: 'rounded-2xl',
        },
    };
}
