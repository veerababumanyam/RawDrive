"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme names must match design-tokens.json keys exactly — these are
 * the selectors the compiled CSS targets ([data-theme="liquid-glass-dark"], etc.).
 */
export type ThemeMode = "liquid-glass" | "liquid-glass-dark" | "midnight";

const DARK_THEMES: ReadonlySet<ThemeMode> = new Set(["liquid-glass-dark", "midnight"]);

export function isDarkTheme(theme: ThemeMode): boolean {
  return DARK_THEMES.has(theme);
}

type ThemeContextValue = {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "rawdrive-theme";
const VALID_THEMES: ReadonlySet<string> = new Set(["liquid-glass", "liquid-glass-dark", "midnight"]);
const DEFAULT_THEME: ThemeMode = "liquid-glass-dark";

const META_COLORS: Record<ThemeMode, string> = {
  "liquid-glass": "#f6f7f9",
  "liquid-glass-dark": "#0f1219",
  "midnight": "#070709",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null | undefined): value is ThemeMode {
  return typeof value === "string" && VALID_THEMES.has(value);
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";

  if (document.body) {
    document.body.dataset.theme = theme;
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", META_COLORS[theme]);
  }
}

function readInitialTheme(): ThemeMode {
  if (typeof document !== "undefined" && isTheme(document.documentElement.dataset.theme)) {
    return document.documentElement.dataset.theme;
  }

  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);

  // Apply the theme to the DOM whenever it changes. Persistence to
  // localStorage is deliberately NOT done here — we only persist when
  // the visitor makes an explicit choice via setTheme/toggleTheme below,
  // so that a first-time visitor with no saved preference continues to
  // follow their OS `prefers-color-scheme` on every subsequent navigation.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Live-track OS theme changes while the page is open, but only if the
  // visitor has NOT yet chosen a theme explicitly. Once they've picked
  // one via the in-app toggle, their choice is authoritative.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY) !== null) return;
      setThemeState(e.matches ? "liquid-glass-dark" : "liquid-glass");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Explicit user actions — these write localStorage so the choice
  // persists across navigations and overrides the OS preference.
  const persistAndSet = (next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be blocked; the DOM update still happens via state */
    }
    setThemeState(next);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: isDarkTheme(theme),
      setTheme: persistAndSet,
      toggleTheme: () =>
        persistAndSet(isDarkTheme(theme) ? "liquid-glass" : "liquid-glass-dark"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

/**
 * Inline init script injected from the root layout. It runs before React
 * hydration so the correct theme is applied on first paint and there is
 * no flash of wrong theme.
 *
 * Decision order:
 *
 *   1. Explicit user preference in localStorage wins, always.
 *   2. Otherwise, follow the OS `prefers-color-scheme` media query so a
 *      dark-mode OS gets `liquid-glass-dark` and a light-mode OS gets
 *      `liquid-glass`.
 *   3. Otherwise, fall back to DEFAULT_THEME.
 *
 * Every route executes this same script at navigation time, which is
 * why all pages stay in sync.
 */
// NOTE: this exported script string is RETAINED for reference and any
// future SSR-string consumer, but the production runtime now loads the
// same script via <script src="/theme-init.js" /> in src/app/layout.tsx
// to avoid the React 19 "Encountered a script tag" warning. When the
// constants above (STORAGE_KEY / VALID_THEMES / DARK_THEMES / META_COLORS
// / DEFAULT_THEME) change, update frontend/public/theme-init.js too.
export const rawDriveThemeInitScript = `
  (() => {
    try {
      const key = "${STORAGE_KEY}";
      const validThemes = ${JSON.stringify([...VALID_THEMES])};
      const stored = window.localStorage.getItem(key);
      let theme;
      if (validThemes.includes(stored)) {
        theme = stored;
      } else {
        const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        theme = prefersDark ? "liquid-glass-dark" : "liquid-glass";
      }
      document.documentElement.dataset.theme = theme;
      const darkThemes = ${JSON.stringify([...DARK_THEMES])};
      document.documentElement.style.colorScheme = darkThemes.includes(theme) ? "dark" : "light";
      const metaColors = ${JSON.stringify(META_COLORS)};
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute("content", metaColors[theme] || "${META_COLORS[DEFAULT_THEME]}");
      }
    } catch (_error) {
      document.documentElement.dataset.theme = "${DEFAULT_THEME}";
      document.documentElement.style.colorScheme = "dark";
    }
  })();
`;
