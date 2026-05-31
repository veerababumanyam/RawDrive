/**
 * /stream/[id] not-found — branded full-page 404 for the public viewer segment
 * (DEF-2).
 *
 * Server component (no "use client"): rendered when the page calls notFound()
 * for an unknown/invalid stream id. Mirrors the page.tsx <main> wrapper so the
 * not-found state is visually consistent with the live viewer.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen w-full bg-surface-canvas px-4 py-8">
      <section
        data-testid="stream-not-found"
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl glass-card p-8 text-center"
        aria-label="Stream not found"
      >
        <h1 className="text-2xl font-semibold text-text-primary">Stream not found</h1>
        <p className="text-sm text-text-secondary">
          This stream link is invalid or the stream is no longer available.
        </p>
        <Link href="/" className="text-sm font-medium text-accent hover:text-accent-hover">
          Return home
        </Link>
      </section>
    </main>
  );
}
