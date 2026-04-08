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

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: isDarkTheme(theme),
      setTheme: setThemeState,
      toggleTheme: () =>
        setThemeState((current) =>
          isDarkTheme(current) ? "liquid-glass" : "liquid-glass-dark",
        ),
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

export const rawDriveThemeInitScript = `
  (() => {
    try {
      const key = "${STORAGE_KEY}";
      const validThemes = ${JSON.stringify([...VALID_THEMES])};
      const stored = window.localStorage.getItem(key);
      const theme = validThemes.includes(stored) ? stored : "${DEFAULT_THEME}";
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
