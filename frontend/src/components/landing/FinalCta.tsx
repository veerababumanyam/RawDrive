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
        className="font-headline text-4xl font-bold text-text-primary sm:text-5xl lg:text-6xl"
      >
        Your studio, finally in one place.
      </h2>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
        <Link
          href="/register"
          className="btn-primary touch-min px-8 py-4 text-base font-semibold"
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
      </div>
    </section>
  );
}
