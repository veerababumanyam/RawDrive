"use client";

/**
 * SharePinGate — PIN entry for a share-link-gated public gallery (S4-G2,
 * integration audit 2026-05-31).
 *
 * A share link of the shape `/g/{slug}?share=<token>` (PIN access mode)
 * requires the recipient to enter a PIN before any asset bytes are served.
 * Entering the PIN must MINT a gallery session and then load the gallery with
 * that session.
 *
 * Flow (all same-origin, so it works through the Next.js /api/v1 rewrite and
 * the API can set the httpOnly gallery_session cookie on the page origin):
 *
 *   1. The recipient types the PIN.
 *   2. We hit GET /api/v1/public/galleries/{slug}?share=<token>&pin=<pin>.
 *      The backend's tryBindShareSession validates the link (expiry, PIN,
 *      max_access_count), and on success sets the `gallery_session` cookie
 *      AND echoes the freshly minted token in the `X-Gallery-Session` header
 *      (readable here because the request is same-origin via the proxy).
 *   3. We persist that token to sessionStorage (for the `?gs=` image channel)
 *      and reload the page WITHOUT the share/pin query params. The reloaded
 *      server render reads the cookie, gets the full gallery payload, and
 *      passes the session token down to the image grid.
 *
 * On an invalid / expired / exhausted link the backend returns the locked
 * shell (no session minted, no X-Gallery-Session header), which we surface as
 * a generic "incorrect PIN" error (never leaking which failure mode it was).
 *
 * Token-only styling; renders identically across all three themes. The submit
 * button is a 44px touch target; the input/button use the token focus ring.
 */

import { useState } from "react";

import { Lock } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";

interface Props {
  slug: string;
  shareToken: string;
  ws?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
}

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  return `${base}${url}`;
}

export function SharePinGate({
  slug,
  shareToken,
  ws,
  brandName,
  logoUrl,
}: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Same-origin via the Next.js /api/v1 rewrite so the API's Set-Cookie
      // (gallery_session, httpOnly, SameSite=Strict) lands on this origin.
      const params = new URLSearchParams();
      params.set("share", shareToken);
      params.set("pin", pin);
      if (ws) params.set("ws", ws);
      const res = await fetch(
        `/api/v1/public/galleries/${slug}?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      // tryBindShareSession only emits X-Gallery-Session on a successful mint;
      // its absence means the PIN/link was rejected even on a 200 locked shell.
      const minted = res.headers.get("X-Gallery-Session");
      if (res.ok && minted) {
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(`gallery_session_${slug}`, minted);
          } catch {
            /* private mode — the httpOnly cookie still carries the session */
          }
          const url = new URL(window.location.href);
          // Strip the one-shot share/pin params; the session cookie now carries access.
          url.searchParams.delete("share");
          url.searchParams.delete("share_pin");
          url.searchParams.delete("pin");
          window.location.replace(url.toString());
        }
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes.");
      } else {
        setError(
          "Incorrect PIN. Please check the link your photographer sent you.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="surface-panel w-full max-w-sm p-8 text-center">
        {logoUrl ? (
          <img
            src={absoluteApiUrl(logoUrl)}
            alt={`${brandName ?? "Studio"} logo`}
            className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-surface-sunken object-contain p-2"
          />
        ) : (
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-sunken">
            <Lock className="h-7 w-7 text-text-tertiary" aria-hidden="true" />
          </div>
        )}
        {brandName && (
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">
            {brandName}
          </p>
        )}
        <h1 className="text-xl font-semibold text-text-primary">
          Enter your access PIN
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This gallery link is protected with a PIN.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Access PIN"
            className="input-base w-full text-center tracking-[0.3em]"
            autoFocus
            aria-label="Gallery access PIN"
          />
          {error && (
            <p className="text-xs text-error" role="alert">
              {error}
            </p>
          )}
          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={!pin || loading}
            className="w-full"
          >
            {loading ? "Verifying..." : "View Gallery"}
          </GlassButton>
        </form>
      </div>
    </div>
  );
}
