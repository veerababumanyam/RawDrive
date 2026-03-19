/**
 * @deprecated Legacy theme engine -- use UnifiedThemeEngine from shared/ instead.
 * This file is kept as a re-export stub for backward compatibility with editor
 * components and ProfileGridItem/ProfileContainer that still consume ProfileTheme.
 * Public profile pages now route through PublicProfileRenderer -> UnifiedThemeEngine.
 */

import { resolveThemeId, resolveThemeTokens, LEGACY_TO_PREBUILT_MAP } from './shared/UnifiedThemeEngine';
import type { ThemeTokens } from './shared/UnifiedThemeEngine';

// ---------------------------------------------------------------------------
// Re-exported ProfileTheme interface (backward compat for editor components)
// ---------------------------------------------------------------------------

export interface ProfileTheme {
    id: string;
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

// ---------------------------------------------------------------------------
// Stub: getTheme delegates to UnifiedThemeEngine
// ---------------------------------------------------------------------------

/**
 * @deprecated Use resolveThemeTokens() from UnifiedThemeEngine instead.
 *
 * Resolves a theme ID (legacy or PREBUILT) to a ProfileTheme shape using
 * UnifiedThemeEngine under the hood. CSS custom property classes are returned
 * so that Tailwind arbitrary-value classes continue to work in editor components.
 */
export function getTheme(themeId?: string): ProfileTheme {
    const resolvedId = resolveThemeId(themeId ?? null);
    const tokens = resolveThemeTokens(resolvedId, false);

    return {
        id: resolvedId,
        name: resolvedId,
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
            background: tokens['--theme-bg'],
            text: tokens['--theme-text'],
            textSecondary: tokens['--theme-text-secondary'],
            accent: tokens['--theme-accent'],
            surface: tokens['--theme-surface'],
            border: tokens['--theme-border'],
        },
        typography: {
            headingFont: tokens['--theme-font-heading'],
            bodyFont: tokens['--theme-font-body'],
        },
        effects: {
            glassmorphism: false,
            blur: 'backdrop-blur-none',
            shadow: tokens['--theme-shadow'],
            radius: tokens['--theme-radius'],
        },
    };
}

// Re-export UnifiedThemeEngine symbols for gradual migration
export { LEGACY_TO_PREBUILT_MAP, resolveThemeId, resolveThemeTokens };
export type { ThemeTokens };
