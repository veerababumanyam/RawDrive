import type { Metadata } from "next";
import { MarketplaceShowcasePage } from "@/components/marketing/MarketplaceShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("camera-rentals");

export default function RentalsMarketplacePage() {
  return (
    <MarketplaceShowcasePage
      eyebrow="Rental Network"
      title="Reserve cameras, lenses, lights, and production gear without leaving your workflow."
      description="Find rental kits by city, brand, shoot type, and availability for wedding, event, portrait, and commercial production days."
      previewSrc="/stitch/rentals.png"
      previewAlt="RawDrive camera rentals marketplace preview"
      primaryCta={{ href: "/contact", label: "Request a rental" }}
      secondaryCta={{ href: "/register", label: "Join RawDrive" }}
      filters={["Sony", "Canon", "Lights", "Lenses", "Mumbai", "Insurance ready"]}
      answer="RawDrive camera rentals are best for studios that need production-ready cameras, lenses, lights, audio, and support kits from verified regional partners."
      cards={[
        {
          name: "Cinema Prime Kit",
          location: "Mumbai",
          specialty: "Sony FX3, 24-70 GM II, wireless audio",
          badge: "Popular",
          price: "From Rs. 5k/day",
          image:
            "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
          note: "Built for fast-moving wedding and brand shoots with premium stabilization support.",
        },
        {
          name: "Portrait Light Set",
          location: "Delhi NCR",
          specialty: "Strobes, modifiers, stands, seamless kit",
          badge: "Studio",
          price: "From Rs. 3.2k/day",
          image:
            "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
          note: "Ideal for clean portrait sessions, headshots, and controlled indoor campaign work.",
        },
        {
          name: "Travel Creator Pack",
          location: "Bengaluru",
          specialty: "Compact camera kit with gimbal and drone",
          badge: "Portable",
          price: "From Rs. 4.4k/day",
          image:
            "https://images.unsplash.com/photo-1495707902641-75cac588d2e9?auto=format&fit=crop&w=900&q=80",
          note: "Optimized for destination shoots and light travel workflows that still need cinematic output.",
        },
      ]}
    />
  );
}
