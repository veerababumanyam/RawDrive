import Link from "next/link";

/**
 * §4.7 Final CTA
 *
 * Centered, one line of editorial type, one primary button, one ghost
 * link, generous white space. The page ends here — no closing
 * testimonial (Q7), no fake logo row.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="landing-final-cta mx-auto max-w-4xl"
    >
      <h2
        id="final-cta-heading"
        className="font-headline text-4xl font-bold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-6xl"
      >
        Your studio, finally in one place.
      </h2>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
        <Link
          href="/register"
          className="btn-primary px-8 text-base font-semibold"
          style={{
            minHeight: "var(--touch-target-min)",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          Start free trial
        </Link>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-base font-semibold text-text-secondary transition-opacity hover:opacity-80"
          style={{ minHeight: "var(--touch-target-min)" }}
        >
          See pricing
          <span aria-hidden="true" className="inline-block text-xl leading-none">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
