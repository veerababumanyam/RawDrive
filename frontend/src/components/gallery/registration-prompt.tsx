"use client";

/**
 * RegistrationPrompt — GAL-FR-102
 *
 * Optional, dismissable "create account" dialog shown after a configurable
 * delay on the public gallery page. The prompt is session-dismissable (a
 * sessionStorage key suppresses re-shows in the same tab) but does NOT write
 * a permanent cookie — the next tab gets a fresh timer. This matches the
 * requirement for "optional registration prompts after delay" without
 * becoming a persistent annoyance.
 *
 * Rules:
 *   - Never show on first load — minimum 30s delay (default 60s) so it
 *     doesn't fire before the visitor has formed any intent.
 *   - Close button + Esc key both dismiss.
 *   - Outside-click does NOT dismiss (avoids accidental close while panning
 *     on mobile).
 *   - Dismissal is session-scoped, not permanent.
 */

import { useEffect, useState } from "react";

interface Props {
  /** Delay in milliseconds before the prompt appears. Clamped to >= 30s. */
  delayMs?: number;
  /** Key used for session dismissal tracking — usually the gallery slug. */
  dismissKey: string;
  /** Title shown in the prompt header. */
  title?: string;
  /** Body copy. */
  body?: string;
  /** Primary CTA label + href. */
  ctaLabel?: string;
  ctaHref?: string;
}

export function RegistrationPrompt({
  delayMs = 60_000,
  dismissKey,
  title = "Keep these memories",
  body = "Create a free account to save favourites, leave comments, and get notified when new photos are added.",
  ctaLabel = "Create free account",
  ctaHref = "/register",
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Session-scoped dismissal check.
    if (typeof window === "undefined") return;
    const storageKey = `rawdrive:reg-prompt:${dismissKey}`;
    if (window.sessionStorage.getItem(storageKey) === "dismissed") return;

    const clamped = Math.max(delayMs, 30_000);
    const timer = window.setTimeout(() => setVisible(true), clamped);
    return () => window.clearTimeout(timer);
  }, [delayMs, dismissKey]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(`rawdrive:reg-prompt:${dismissKey}`, "dismissed");
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reg-prompt-title"
      className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl bg-surface-raised/95 backdrop-blur-xl border border-border-subtle p-5 shadow-2xl"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 h-6 w-6 rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-sunken flex items-center justify-center text-lg leading-none"
      >
        ×
      </button>
      <h3 id="reg-prompt-title" className="text-base font-semibold text-text-primary pr-6">
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-text-secondary">{body}</p>
      <div className="mt-4 flex items-center gap-2">
        <a
          href={ctaHref}
          className="inline-flex items-center justify-center rounded-xl bg-accent-primary px-4 py-2 text-sm font-medium text-accent-primary-contrast hover:opacity-90"
        >
          {ctaLabel}
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
