import Image from "next/image";
import { Heart } from "lucide-react";

/**
 * §4.3 Gallery Experience
 *
 * Image-led editorial section showing the client-facing side of RawDrive.
 * The emotional payoff for the bride and groom, not the studio. Single
 * large photograph (13.jpg — mandap ritual) with a floating "favorites
 * count" glass chip overlaid on the bottom-right corner, and a short
 * supporting paragraph underneath.
 */
export function GallerySection() {
  return (
    <section
      aria-labelledby="gallery-heading"
      className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-12"
    >
      <div className="mb-12 max-w-2xl">
        <p className="font-headline text-xs font-semibold uppercase tracking-[0.32em] text-text-tertiary">
          The client experience
        </p>
        <h2
          id="gallery-heading"
          className="mt-4 font-headline text-3xl font-bold leading-[1.08] tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
        >
          Your clients, picking favorites in bed.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-text-secondary sm:text-lg">
          From any device. Galleries work on budget Android phones, stream
          WebP derivatives to save mobile data, and hand every favorite back
          to your studio in one tap.
        </p>
      </div>

      <div className="landing-gallery-photo">
        <Image
          src="/landing/13.webp"
          alt="A bride at the mandap during a traditional Indian wedding ritual — the kind of moment clients star as a favorite in their RawDrive gallery."
          fill
          sizes="(min-width: 1280px) 1280px, 100vw"
          className="object-cover"
        />
        <div className="landing-gallery-photo__scrim" aria-hidden="true" />
        <div className="landing-gallery-chip" role="note">
          <Heart className="h-4 w-4" aria-hidden="true" />
          <span>128 favorites</span>
        </div>
      </div>
    </section>
  );
}
