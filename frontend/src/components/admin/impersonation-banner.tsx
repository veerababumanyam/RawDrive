"use client";

/**
 * ImpersonationBanner — persistent read-only signal for an admin impersonation
 * session (S5-G1, integration audit 2026-05-31).
 *
 * The backend mints impersonation access tokens carrying an `impersonation:
 * true` claim and rejects EVERY mutating request on such a session with 403.
 * Without a clear UI signal an admin would only discover the read-only nature
 * by hitting surprise 403s mid-edit. This banner:
 *
 *   1. Renders a persistent, accessible (role="status") bar pinned to the top
 *      of the viewport whenever the active session is an impersonation session.
 *   2. Sets `data-impersonation="true"` on <html>, which a single global CSS
 *      rule (globals.css) uses to visually disable + block pointer events on
 *      any control tagged `data-mutation` — so mutating affordances read as
 *      unavailable instead of failing on click.
 *   3. Offers an "Exit impersonation" action that logs out the impersonated
 *      session and returns the admin to login (where they re-auth as
 *      themselves). The impersonation token is a non-refreshable access token,
 *      so logout is the correct, clean exit.
 *
 * Token-only styling; renders identically across all three themes. The exit
 * control is a 44px touch target with a token focus ring.
 */

import { useEffect, useSyncExternalStore } from "react";
import { isImpersonatingSession, logoutAuthSession } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// Client-only "is mounted" check via useSyncExternalStore — the access token
// lives in a client-side cache, so the impersonation claim is only knowable
// after hydration. getServerSnapshot=false (SSR renders nothing), getSnapshot
// =true (client). This is the project's established pattern (see
// ThemeToggleButton) and avoids the react-hooks/set-state-in-effect rule that
// fires on the naive useEffect(() => setMounted(true), []) approach.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

export function ImpersonationBanner() {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

  const active = mounted && isImpersonatingSession();

  // Mirror the active state onto <html> so the global read-only CSS rule
  // (globals.css) can disable mutating controls. Cleanup on unmount / when the
  // session is no longer an impersonation session.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (active) {
      document.documentElement.setAttribute("data-impersonation", "true");
    } else {
      document.documentElement.removeAttribute("data-impersonation");
    }
    return () => {
      document.documentElement.removeAttribute("data-impersonation");
    };
  }, [active]);

  if (!active) return null;

  const handleExit = async () => {
    await logoutAuthSession(API_BASE);
    window.location.assign("/login");
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-feedback-warning/15 px-4 py-2 text-center glass-blur-medium"
    >
      <svg
        className="h-4 w-4 shrink-0 text-feedback-warning"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12a9.75 9.75 0 1119.5 0 9.75 9.75 0 01-19.5 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8.25v4.5M12 15.75h.008"
        />
      </svg>
      <p className="text-xs font-medium text-text-primary sm:text-sm">
        <span className="font-semibold">Read-only impersonation session.</span>{" "}
        <span className="text-text-secondary">
          You are viewing this account as an admin. Changes are disabled.
        </span>
      </p>
      <button
        type="button"
        onClick={handleExit}
        className="min-h-[var(--touch-target-min)] shrink-0 rounded-lg border border-border-default px-3 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        Exit impersonation
      </button>
    </div>
  );
}
