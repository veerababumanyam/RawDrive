import type { Metadata } from "next";
import { MarketplaceShowcasePage } from "@/components/marketing/MarketplaceShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("camera-rentals");

export default function RentalsMarketplacePage() {
  return (
    <MarketplaceShowcasePage
      path="/marketplaces/rentals"
      breadcrumbName="Camera Rentals"
      eyebrow="Rental Network"
      title="Reserve cameras, lenses, lights, and production gear without leaving your workflow."
      description="Find rental kits by city, brand, shoot type, and availability for wedding, event, portrait, and commercial production days."
      previewSrc="/marketing/rawdrive-camera-rentals.avif"
      previewAlt="RawDrive camera rentals marketplace preview"
      primaryCta={{ href: "/contact", label: "Request a rental" }}
      secondaryCta={{ href: "/register", label: "Join RawDrive" }}
      filters={[
        "Sony",
        "Canon",
        "Lights",
        "Lenses",
        "Mumbai",
        "Insurance ready",
      ]}
      answer="RawDrive camera rentals are best for studios that need production-ready cameras, lenses, lights, audio, and support kits from verified regional partners."
      cardsNote="Example kits; availability varies by city."
      cards={[
        {
          name: "Cinema Prime Kit",
          location: "Mumbai",
          specialty: "Sony FX3, 24-70 GM II, wireless audio",
          badge: "Popular",
          price: "From Rs. 5k/day",
          image: "/marketing/rawdrive-rentals-card-1.avif",
          note: "Built for fast-moving wedding and brand shoots with premium stabilization support.",
        },
        {
          name: "Portrait Light Set",
          location: "Delhi NCR",
          specialty: "Strobes, modifiers, stands, seamless kit",
          badge: "Studio",
          price: "From Rs. 3.2k/day",
          image: "/marketing/rawdrive-rentals-card-2.avif",
          note: "Ideal for clean portrait sessions, headshots, and controlled indoor campaign work.",
        },
        {
          name: "Travel Creator Pack",
          location: "Bengaluru",
          specialty: "Compact camera kit with gimbal and drone",
          badge: "Portable",
          price: "From Rs. 4.4k/day",
          image: "/marketing/rawdrive-rentals-card-3.avif",
          note: "Optimized for destination shoots and light travel workflows that still need cinematic output.",
        },
      ]}
    />
  );
}
