import Image from "next/image";

/**
 * §4.5 AI & Automation Moment
 *
 * Honest, grounded portrait of the intelligence layer that is actually
 * shipped today. No fictional throughput numbers ("600 from 4,000 in
 * 6 minutes" was dropped after the Q2 audit of backend/internal/ai/).
 *
 * Four capability pillars, each one backed by a real Go service file:
 *
 *   1. Quality ranked        → culling_service.go
 *   2. Duplicates grouped    → duplicate_service.go + burst_service.go
 *   3. Faces clustered       → face_service.go
 *   4. Natural-language      → search_service.go
 *
 * Visual: image-led section backed by 16.jpg (joyful multi-person ritual)
 * with a theme-aware scrim that guarantees AA contrast over any area of
 * the photograph.
 */

const PILLARS = [
  {
    title: "Quality ranked",
    body: "Every image scored on sharpness, exposure, and composition. See the strongest frames first, without a spreadsheet.",
  },
  {
    title: "Duplicates grouped",
    body: "Near-identical frames from bursts are grouped so you review one, not ten.",
  },
  {
    title: "Faces clustered",
    body: "Every person in the album detected and grouped. Name them once, and your clients can find themselves in seconds.",
  },
  {
    title: "Natural-language search",
    body: "Ask for \u201Cthe bride laughing with her father\u201D and find the frame without a single manual tag.",
  },
];

export function AiMomentSection() {
  return (
    <section
      aria-labelledby="ai-heading"
      className="mx-auto max-w-7xl px-6 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20"
    >
      <div className="landing-ai relative overflow-hidden rounded-[var(--radius-2xl)]">
        <div className="landing-ai__photo">
          <Image
            src="/landing/ai-couple.avif"
            alt=""
            fill
            sizes="(min-width: 1280px) 1280px, 100vw"
            className="object-cover"
            aria-hidden="true"
          />
        </div>
        <div className="landing-ai__scrim" aria-hidden="true" />

        <div className="relative grid gap-12 p-8 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:p-16">
          <div className="max-w-xl">
            <p className="font-headline text-xs font-semibold uppercase tracking-[0.32em] text-text-tertiary">
              The intelligence layer
            </p>
            <h2
              id="ai-heading"
              className="mt-4 font-headline text-3xl font-bold leading-[1.05] tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
            >
              Ranked, grouped, and searchable
              <br />
              <span className="text-text-secondary">
                — before you start editing.
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary sm:text-lg">
              A quiet intelligence layer that looks at every photo so you do not
              have to.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="landing-ai__pillar">
                <h3 className="font-headline text-base font-semibold text-text-primary">
                  {pillar.title}
                </h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
