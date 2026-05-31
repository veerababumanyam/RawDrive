"use client";

/**
 * GalleryLockedShell — the non-broken "you cannot see this yet" state for a
 * gated public gallery (S4-G3, integration audit 2026-05-31).
 *
 * Rendered when GET /public/galleries/{slug} returns the locked shell
 * ({ access_gated: true, access_mode, has_password }) for a private /
 * invite-only gallery viewed without a valid session, OR for an expired
 * gallery. The viewer must NOT fall through to an empty asset grid — that
 * reads as "the photographer published nothing" instead of "this is locked".
 *
 * Three variants:
 *   - "private"      → access_mode === "private": requires a share link.
 *   - "invite-only"  → access_mode === "invite-only": requires an invite.
 *   - "expired"      → the gallery's expiry window has passed.
 *
 * Token-only styling, renders identically across all three themes (no
 * theme-specific overrides). The single CTA, when present, is a real 44px
 * touch target with a token focus ring.
 */

type LockedVariant = "private" | "invite-only" | "expired";

interface Props {
  variant: LockedVariant;
  title?: string;
  brandName?: string | null;
  logoUrl?: string | null;
}

function LockIcon() {
  return (
    <svg
      className="h-7 w-7 text-text-tertiary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-7 w-7 text-text-tertiary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const COPY: Record<LockedVariant, { heading: string; body: string }> = {
  "private": {
    heading: "This gallery is private",
    body: "Open it using the share link your photographer sent you. If you don't have one, please ask them to share it again.",
  },
  "invite-only": {
    heading: "This gallery is invite-only",
    body: "Access is limited to invited guests. Please open the invite link your photographer sent you to view these photos.",
  },
  "expired": {
    heading: "This gallery has expired",
    body: "This gallery is no longer available. Please contact the photographer if you still need access.",
  },
};

export function GalleryLockedShell({ variant, title, brandName, logoUrl }: Props) {
  const copy = COPY[variant];
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="surface-panel w-full max-w-sm p-8 text-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${brandName ?? "Studio"} logo`}
            className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-surface-sunken object-contain p-2"
          />
        ) : (
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-sunken">
            {variant === "expired" ? <ClockIcon /> : <LockIcon />}
          </div>
        )}
        {brandName && (
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">{brandName}</p>
        )}
        <h1 className="text-xl font-semibold text-text-primary">{copy.heading}</h1>
        {title && variant !== "expired" && (
          <p className="mt-1 text-sm font-medium text-text-secondary">{title}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{copy.body}</p>
      </div>
    </div>
  );
}
