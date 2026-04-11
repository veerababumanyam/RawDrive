import { CalendarDays, Copy, HardDrive, ReceiptText } from "lucide-react";

/**
 * §4.4 Studio Control
 *
 * Contrast the public gallery beauty (§4.3) with the operator-facing
 * backend. Four glass tiles side-by-side — Bookings, AI duplicates,
 * Storage, GST. Each has a minimal SVG/CSS visualization built from
 * token primitives. No external chart libraries. No fake mockups.
 *
 * This is the section that repositions RawDrive from "gallery app"
 * to "operating system."
 */
export function StudioControlSection() {
  return (
    <section
      aria-labelledby="studio-heading"
      className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-12"
    >
      <div className="mb-12 max-w-2xl">
        <p className="font-headline text-xs font-semibold uppercase tracking-[0.32em] text-text-tertiary">
          The studio side
        </p>
        <h2
          id="studio-heading"
          className="mt-4 font-headline text-3xl font-bold leading-[1.08] tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
        >
          Your studio, running itself in the background.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-text-secondary sm:text-lg">
          Bookings, AI cleanup, storage, GST, team roles — the boring work
          happens where you cannot see it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Bookings & advances */}
        <article className="landing-studio-tile">
          <header className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h3 className="font-headline text-base font-semibold text-text-primary">
              Bookings &amp; advances
            </h3>
          </header>
          <div className="landing-studio-tile__viz">
            <BookingMiniCalendar />
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Calendar, crew, advance payment — tracked per shoot without a
            spreadsheet.
          </p>
        </article>

        {/* 2. AI duplicate cleanup */}
        <article className="landing-studio-tile">
          <header className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <Copy className="h-5 w-5" />
            </span>
            <h3 className="font-headline text-base font-semibold text-text-primary">
              Duplicate cleanup
            </h3>
          </header>
          <div className="landing-studio-tile__viz">
            <DuplicateMiniViz />
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Near-identical frames from bursts grouped automatically. Review
            one, not ten.
          </p>
        </article>

        {/* 3. Storage on R2 */}
        <article className="landing-studio-tile">
          <header className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <HardDrive className="h-5 w-5" />
            </span>
            <h3 className="font-headline text-base font-semibold text-text-primary">
              Storage on R2
            </h3>
          </header>
          <div className="landing-studio-tile__viz gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-text-primary">340 GB</span>
              <span className="text-text-tertiary">of 1 TB</span>
            </div>
            <div className="landing-storage-bar" aria-hidden="true">
              <span
                className="landing-storage-bar__fill"
                style={{ width: "34%" }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              Cloudflare R2 · globally distributed · JWT-gated
            </p>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            R2-backed secure delivery. No public URLs, no leaky links.
          </p>
        </article>

        {/* 4. GST & team roles */}
        <article className="landing-studio-tile">
          <header className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <ReceiptText className="h-5 w-5" />
            </span>
            <h3 className="font-headline text-base font-semibold text-text-primary">
              GST &amp; team roles
            </h3>
          </header>
          <div className="landing-studio-tile__viz gap-1.5 text-sm">
            <div className="flex justify-between border-b border-border-subtle pb-1.5 text-text-secondary">
              <span>Wedding delivery</span>
              <span className="font-semibold text-text-primary">₹85,000</span>
            </div>
            <div className="flex justify-between text-text-tertiary">
              <span>IGST @ 18%</span>
              <span>₹15,300</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border-subtle pt-1.5 font-semibold text-text-primary">
              <span>Total</span>
              <span>₹1,00,300</span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            GST-native invoices. Team roles: 3 editors · 2 admins per studio.
          </p>
        </article>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini visualizations — pure SVG/CSS, no external libraries.       */
/* ------------------------------------------------------------------ */

function BookingMiniCalendar() {
  // A 6-column × 3-row mini calendar grid with two dates highlighted
  // as "shoot scheduled" (accent) and one as "advance received" (success).
  const days = Array.from({ length: 18 }, (_, i) => i + 1);
  const shootDays = new Set([9, 16]);
  const advanceDays = new Set([4]);
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
      {days.map((d) => {
        const isShoot = shootDays.has(d);
        const isAdvance = advanceDays.has(d);
        return (
          <span
            key={d}
            className="flex h-6 items-center justify-center rounded-md text-[10px] font-semibold"
            style={{
              background: isShoot
                ? "linear-gradient(135deg, var(--button-primary-from), var(--button-primary-to))"
                : isAdvance
                  ? "color-mix(in srgb, var(--semantic-success) 26%, transparent)"
                  : "color-mix(in srgb, var(--outline-variant) 14%, transparent)",
              color: isShoot
                ? "var(--button-primary-foreground)"
                : isAdvance
                  ? "var(--semantic-success)"
                  : "var(--text-tertiary)",
            }}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}

function DuplicateMiniViz() {
  // Two near-identical thumbnail squares — one marked "kept" with an
  // accent border, the other marked as duplicate with a strikethrough.
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-lg"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 35%, transparent), color-mix(in srgb, var(--accent-secondary) 35%, transparent))",
          border: "1.5px solid var(--accent-primary)",
          boxShadow:
            "0 8px 24px -8px color-mix(in srgb, var(--accent-primary) 40%, transparent)",
        }}
      >
        <span className="text-[10px] font-bold uppercase text-text-primary">
          Kept
        </span>
      </div>
      <div
        className="relative flex h-16 w-16 items-center justify-center rounded-lg"
        style={{
          background:
            "color-mix(in srgb, var(--surface-container-high) 80%, transparent)",
          border: "1px solid var(--border-subtle)",
          opacity: 0.5,
        }}
      >
        <span className="text-[10px] font-semibold text-text-tertiary line-through">
          Dupe
        </span>
      </div>
      <div className="flex flex-col text-xs">
        <span className="font-semibold text-text-primary">−147</span>
        <span className="text-text-tertiary">duplicates</span>
      </div>
    </div>
  );
}
