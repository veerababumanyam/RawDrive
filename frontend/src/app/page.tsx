import type { Metadata } from "next";

import { AiMomentSection } from "@/components/landing/AiMomentSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { ForceTheme } from "@/components/landing/ForceTheme";
import { GallerySection } from "@/components/landing/GallerySection";
import { Hero } from "@/components/landing/Hero";
import { StudioControlSection } from "@/components/landing/StudioControlSection";
import { TrustRow } from "@/components/landing/TrustRow";
import { WorkflowPipeline } from "@/components/landing/WorkflowPipeline";

export const metadata: Metadata = {
  title: "RawDrive — Run every wedding from inquiry to final delivery",
  description:
    "Galleries, proofing, AI culling, bookings, invoices, and client delivery for modern Indian studios. Built in India. Honest about what it does.",
  openGraph: {
    title: "RawDrive — Run every wedding from inquiry to final delivery",
    description:
      "Galleries, proofing, AI culling, bookings, invoices, and client delivery for modern Indian studios.",
    images: [{ url: "/landing/11.webp", width: 2048, height: 1363, alt: "" }],
  },
};

/**
 * Landing page — cinematic editorial redesign.
 *
 * Architecture:
 *   1. ForceTheme locks the route to `liquid-glass-dark` (Q10) without
 *      touching the visitor's saved preference in localStorage.
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
 */
export default function LandingPage() {
  return (
    <div className="landing-root bg-surface text-text-primary selection:bg-accent-muted selection:text-text-primary">
      <ForceTheme theme="liquid-glass-dark" />
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
