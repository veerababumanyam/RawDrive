"use client";

import { useEffect } from "react";

import {
  isDarkTheme,
  useTheme,
  type ThemeMode,
} from "@/components/theme/ThemeProvider";

/**
 * Force a specific theme on the current route without polluting the user's
 * saved preference.
 *
 * Why this exists: the landing page is forced to `liquid-glass-dark` (Q10
 * of the redesign plan) so the cinematic hero renders against a warm-to-dark
 * photographic backdrop regardless of the visitor's saved theme. However,
 * we never want to *persist* that override — the moment the visitor
 * navigates to /pricing, /features, etc., their saved preference should
 * take effect again.
 *
 * How it works: we directly manipulate `document.documentElement.dataset.theme`
 * and `colorScheme` on mount, WITHOUT going through `ThemeContext.setTheme()`
 * (which would write to localStorage via ThemeProvider's useEffect). On
 * unmount, we restore from `ThemeContext.theme` — which is the authoritative
 * copy of the visitor's actual saved preference because ThemeProvider's state
 * is never modified by us.
 *
 * If the visitor clicks the navbar theme toggle while on the forced page,
 * ThemeProvider's state does update (and localStorage is written), but our
 * effect re-runs because `savedTheme` changed and immediately re-forces the
 * display back to the target. The visible result: the toggle appears to do
 * nothing on the landing, but the visitor's preference is quietly respected
 * once they leave. (The landing also hides the toggle via the navbar
 * `hero-overlay` variant, so this race is mostly theoretical.)
 */
export function ForceTheme({ theme: forced }: { theme: ThemeMode }) {
  const { theme: savedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = forced;
    root.style.colorScheme = isDarkTheme(forced) ? "dark" : "light";

    if (document.body) {
      document.body.dataset.theme = forced;
    }

    return () => {
      root.dataset.theme = savedTheme;
      root.style.colorScheme = isDarkTheme(savedTheme) ? "dark" : "light";
      if (document.body) {
        document.body.dataset.theme = savedTheme;
      }
    };
  }, [forced, savedTheme]);

  return null;
}
