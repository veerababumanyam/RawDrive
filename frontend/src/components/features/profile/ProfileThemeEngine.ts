import { BackgroundTheme } from '../../../types/personalProfile';

export interface ProfileTheme {
    id: BackgroundTheme;
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

export const PROFILE_THEMES: Record<BackgroundTheme, ProfileTheme> = {
    minimal: {
        id: 'minimal',
        name: 'Minimalist',
        colors: {
            background: 'bg-white',
            text: 'text-zinc-900',
            textSecondary: 'text-zinc-500',
            accent: 'text-zinc-900',
            surface: 'bg-zinc-50',
            border: 'border-zinc-200',
            primaryButton: 'bg-zinc-900',
            primaryButtonText: 'text-white',
            secondaryButton: 'bg-white',
            secondaryButtonText: 'text-zinc-900',
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
        name: 'Midnight',
        colors: {
            background: 'bg-zinc-950',
            text: 'text-white',
            textSecondary: 'text-zinc-400',
            accent: 'text-white',
            surface: 'bg-zinc-900',
            border: 'border-zinc-800',
            primaryButton: 'bg-white',
            primaryButtonText: 'text-zinc-950',
            secondaryButton: 'bg-zinc-900',
            secondaryButtonText: 'text-white',
        },
        typography: {
            headingFont: 'font-sans',
            bodyFont: 'font-sans',
        },
        effects: {
            glassmorphism: false,
            blur: 'none',
            shadow: 'shadow-none',
            radius: 'rounded-xl',
        },
    },
    pastel: {
        id: 'pastel',
        name: 'Soft Touch',
        colors: {
            background: 'bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50',
            text: 'text-slate-800',
            textSecondary: 'text-slate-500',
            accent: 'text-indigo-600',
            surface: 'bg-white/60',
            border: 'border-white/40',
            primaryButton: 'bg-slate-800',
            primaryButtonText: 'text-white',
            secondaryButton: 'bg-white/50',
            secondaryButtonText: 'text-slate-800',
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
            text: 'text-white',
            textSecondary: 'text-white/80',
            accent: 'text-yellow-300',
            surface: 'bg-white/10',
            border: 'border-white/20',
            primaryButton: 'bg-white',
            primaryButtonText: 'text-violet-700',
            secondaryButton: 'bg-white/10',
            secondaryButtonText: 'text-white',
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
            text: 'text-zinc-100',
            textSecondary: 'text-zinc-400',
            accent: 'text-amber-500',
            surface: 'bg-zinc-900/50',
            border: 'border-white/5',
            primaryButton: 'bg-zinc-100',
            primaryButtonText: 'text-black',
            secondaryButton: 'bg-zinc-800',
            secondaryButtonText: 'text-zinc-100',
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

export function getTheme(themeId?: BackgroundTheme): ProfileTheme {
    return PROFILE_THEMES[themeId || 'minimal'] || PROFILE_THEMES.minimal;
}
