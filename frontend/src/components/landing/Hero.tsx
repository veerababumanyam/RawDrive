import Image from "next/image";
import Link from "next/link";

import { PwaDownloadButton } from "@/components/landing/PwaDownloadButton";

/**
 * §4.1 Cinematic Hero
 *
 * Full-bleed photograph + editorial headline + two CTAs. No floating chips
 * (per Q3 resolution — removed for breathing room). The entire hero is a
 * single 100dvh section that sits UNDER a translucent navbar in hero-overlay
 * mode. A theme-aware gradient scrim between the photo and the text block
 * guarantees AA contrast at any viewport width or theme.
 *
 * Animation is pure CSS keyframes via inline `animation-delay` values —
 * automatically neutralized by the `prefers-reduced-motion: reduce` rule in
 * `frontend/src/app/globals.css` (lines 609-616). No JS animation library,
 * no reduced-motion hooks, no hydration wait.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="landing-hero relative isolate flex min-h-[100dvh] w-full items-center overflow-hidden"
    >
      {/* Photograph — absolutely positioned, full-bleed, preloaded for LCP. */}
      <div className="landing-hero__photo absolute inset-0 -z-10">
        <Image
          src="/landing/hero-couple.avif"
          alt=""
          fill
          preload
          sizes="100vw"
          className="landing-hero__image object-cover"
          aria-hidden="true"
        />
        {/* Theme-aware scrim — builds a soft editorial stage for the offer
            while keeping the full-bleed photograph intact. Uses plain CSS
            vars so the gradient adapts across all shipped themes. */}
        <div className="landing-hero__scrim" aria-hidden="true" />
        {/* Vignette on the top edge — helps the hero-overlay navbar read
            legibly without a hard background color. */}
        <div className="landing-hero__top-vignette" aria-hidden="true" />
      </div>

      {/* Text block — anchored in the strongest visual zone so the sales
          message lands first, with the photograph acting as supporting
          context rather than competing foreground. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 py-24 sm:px-8 lg:px-12">
        <div className="landing-hero__text max-w-2xl">
          <p className="landing-hero__eyebrow font-headline text-xs font-semibold uppercase tracking-[0.32em] text-text-secondary">
            RawDrive
          </p>

          <h1
            id="hero-heading"
            className="landing-hero__headline mt-6 font-headline text-3xl font-bold leading-[1.02] tracking-tight text-text-primary sm:text-4xl md:text-5xl lg:text-[60px] lg:leading-[1.0]"
          >
            Run every celebration
            <br />
            from inquiry to
            <br />
            final delivery.
          </h1>

          <p className="landing-hero__subhead mt-8 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            Galleries, proofing, AI culling, bookings, invoices, and client
            delivery — for modern Indian studios.
          </p>

          <div className="landing-hero__ctas mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="btn-primary touch-min px-8 py-3 text-base font-semibold"
            >
              Start free trial
            </Link>
            <Link
              href="/pricing"
              className="landing-hero__secondary px-6 text-base"
            >
              See pricing
              <span
                aria-hidden="true"
                className="inline-block text-xl leading-none"
              >
                →
              </span>
            </Link>
            <PwaDownloadButton />
          </div>
        </div>
      </div>

      {/* Scroll cue — tiny chevron glyph, slow float. Decorative. */}
      <div
        aria-hidden="true"
        className="landing-hero__scroll-cue pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-tertiary"
        >
          <path d="M7 13l5 5 5-5" />
          <path d="M7 6l5 5 5-5" />
        </svg>
      </div>
    </section>
  );
}
