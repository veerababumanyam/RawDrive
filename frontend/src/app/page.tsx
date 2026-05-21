import type { Metadata } from "next";

import { AiMomentSection } from "@/components/landing/AiMomentSection";
import { AuthRedirect } from "@/components/landing/AuthRedirect";
import { FinalCta } from "@/components/landing/FinalCta";
import { GallerySection } from "@/components/landing/GallerySection";
import { Hero } from "@/components/landing/Hero";
import { StudioControlSection } from "@/components/landing/StudioControlSection";
import { TrustRow } from "@/components/landing/TrustRow";
import { WorkflowPipeline } from "@/components/landing/WorkflowPipeline";

export const metadata: Metadata = {
  title: "RawDrive — Run every celebration from inquiry to final delivery",
  description:
    "Galleries, proofing, AI culling, bookings, invoices, and client delivery for modern Indian studios. Built in India. Honest about what it does.",
  openGraph: {
    title: "RawDrive — Run every celebration from inquiry to final delivery",
    description:
      "Galleries, proofing, AI culling, bookings, invoices, and client delivery for modern Indian studios.",
    images: [{ url: "/landing/11.webp", width: 2048, height: 1363, alt: "" }],
  },
};

/**
 * Landing page — cinematic editorial redesign.
 *
 * Architecture:
 *   1. The page respects the visitor's theme preference (OS
 *      `prefers-color-scheme` on first visit, user's in-app toggle
 *      thereafter). Every section is tokenized so it renders correctly
 *      in `liquid-glass`, `liquid-glass-dark`, and `midnight`.
 *   2. Hero is a 100dvh photographic section with a staggered page-load
 *      reveal. Navbar floats over it via the hero-overlay variant.
 *   3. WorkflowPipeline is the signature interaction — sticky on desktop
 *      with a scroll-driven per-step activation, snap-carousel on mobile.
 *   4. Gallery / StudioControl / AiMoment are the three narrative
 *      sections that show RawDrive as a photography product, an operating
 *      system, and an intelligence layer in that order.
 *   5. TrustRow + FinalCta close with restraint.
 *
 * See docs/landing-page-redesign-plan.md for the full section-by-section
 * design rationale and the Q&A history behind every copy decision.
 *
 * Q10 update (2026-04-11 evening): the earlier "force liquid-glass-dark"
 * decision was reversed — forcing a theme on one route created visible
 * inconsistency with the rest of the marketing site. All routes now
 * sync to the OS preference + user toggle uniformly.
 */
export default function LandingPage() {
  return (
    <div className="landing-root bg-surface text-text-primary selection:bg-accent-muted selection:text-text-primary">
      <AuthRedirect />
      <Hero />
      <WorkflowPipeline />
      <GallerySection />
      <StudioControlSection />
      <AiMomentSection />
      <TrustRow />
      <FinalCta />
    </div>
  );
}
