"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "@/components/icons";
import { useTheme } from "@/components/theme/ThemeProvider";
import { GlassIconButton } from "@/components/ui/glass-icon-button";

/**
 * Theme toggle button.
 *
 * We deliberately render a placeholder button on the server and mount
 * the real icon only after hydration. The reason: the correct theme
 * (and therefore the correct icon — Sun for dark, Moon for light) is
 * only knowable on the client after the inline init script has read
 * localStorage and/or `prefers-color-scheme`. Rendering an icon on the
 * server would always risk a hydration mismatch when the client's real
 * theme differs from our server-default, forcing React to discard and
 * re-render the whole tree. Empty placeholder → no mismatch, and the
 * button takes its final form on first client render.
 *
 * `useSyncExternalStore` is the React 18+ correct primitive for this
 * "is mounted" check — `getServerSnapshot` returns false (we are
 * definitely not on the client at SSR time), and `getSnapshot` returns
 * true (we definitely are on the client once hydration runs). This
 * avoids the `react-hooks/set-state-in-effect` lint rule that fires on
 * the naive `useEffect(() => setMounted(true), [])` pattern.
 */
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

export function ThemeToggleButton({ className }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

  // Placeholder preserves layout / touch target while the real icon
  // resolves on the client. The `aria-hidden` while unmounted keeps
  // screen readers quiet for the brief pre-hydration window.
  if (!mounted) {
    return (
      <span
        className={cn(
          "glass-icon-button glass-icon-button--md glass-icon-button--ghost",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <GlassIconButton
      type="button"
      onClick={toggleTheme}
      variant="ghost"
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={className}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </GlassIconButton>
  );
}
