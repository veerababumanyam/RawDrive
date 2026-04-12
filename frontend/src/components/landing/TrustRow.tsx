/**
 * §4.6 Trust Row
 *
 * Four defensible trust cues in a single calm row, replacing the old
 * "5,000+ Active Studios / 1M+ Photos Delivered / ₹50Cr+ Revenue Processed"
 * stats that the current landing shipped (and could not defend).
 *
 * The "11 Indian languages" chip was dropped after the Q4 audit found
 * that no i18n exists at any layer of the client gallery today — see
 * docs/landing-page-redesign-plan.md §0.5 Q4 and §14 for the full story.
 * The truthful fourth chip is "Mobile-first on budget Android", which
 * maps directly to the explicit `xs` breakpoint definition in
 * design-tokens.json.
 *
 * No counts. No rupee totals. No "500+ happy customers". Ever.
 */

const CHIPS = [
  "DPDPA-ready",
  "SOC2-aligned security controls",
  "GST-native invoicing",
  "R2-backed secure delivery",
  "Mobile-first on budget Android",
];

export function TrustRow() {
  return (
    <section
      aria-labelledby="trust-heading"
      className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-12"
    >
      <h2 id="trust-heading" className="sr-only">
        Why Indian studios trust RawDrive
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {CHIPS.map((chip) => (
          <span key={chip} className="landing-trust-pill">
            <span className="landing-trust-pill__dot" aria-hidden="true" />
            {chip}
          </span>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-text-tertiary">
        Made in India. Built for how Indian studios actually work.
      </p>
    </section>
  );
}
