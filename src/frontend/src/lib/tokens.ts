export const THEMES = ['liquid-glass', 'liquid-glass-dark', 'midnight'] as const
export type Theme = (typeof THEMES)[number]

const tokenValues: Record<string, Record<string, string>> = {
  'liquid-glass': {
    background: '#F8FAFC',
    foreground: '#0F172A',
    primary: '#3B82F6',
    'primary-foreground': '#FFFFFF',
    card: 'rgba(255,255,255,0.72)',
    'card-foreground': '#0F172A',
    muted: 'rgba(241,245,249,0.60)',
    'muted-foreground': '#64748B',
    accent: 'rgba(219,234,254,0.60)',
    border: 'rgba(226,232,240,0.60)',
    ring: 'rgba(59,130,246,0.50)',
    success: '#10B981',
    warning: '#F59E0B',
    destructive: '#EF4444',
  },
  'liquid-glass-dark': {
    background: '#0F172A',
    foreground: '#F1F5F9',
    primary: '#60A5FA',
    'primary-foreground': '#0F172A',
    card: 'rgba(30,41,59,0.72)',
    'card-foreground': '#F1F5F9',
    muted: 'rgba(51,65,85,0.60)',
    'muted-foreground': '#94A3B8',
    accent: 'rgba(30,58,138,0.60)',
    border: 'rgba(51,65,85,0.60)',
    ring: 'rgba(96,165,250,0.50)',
    success: '#34D399',
    warning: '#FBBF24',
    destructive: '#F87171',
  },
  midnight: {
    background: '#000000',
    foreground: '#FAFAFA',
    primary: '#F59E0B',
    'primary-foreground': '#000000',
    card: 'rgba(23,23,23,0.80)',
    'card-foreground': '#FAFAFA',
    muted: 'rgba(38,38,38,0.60)',
    'muted-foreground': '#A3A3A3',
    accent: 'rgba(120,53,15,0.40)',
    border: 'rgba(38,38,38,0.80)',
    ring: 'rgba(245,158,11,0.50)',
    success: '#34D399',
    warning: '#FBBF24',
    destructive: '#F87171',
  },
}

export function getToken(name: string, theme: Theme = 'liquid-glass'): string | undefined {
  return tokenValues[theme]?.[name]
}

export function getThemeTokens(theme: Theme): Record<string, string> {
  return tokenValues[theme] || {}
}
