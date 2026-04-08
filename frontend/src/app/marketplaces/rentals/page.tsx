import type { Metadata } from "next";
import { MarketplaceShowcasePage } from "@/components/marketing/MarketplaceShowcasePage";

export const metadata: Metadata = {
  title: "Camera Rentals | RawDrive",
  description: "Camera and gear rentals from verified partners in your region.",
};

export default function RentalsMarketplacePage() {
  return (
    <MarketplaceShowcasePage
      eyebrow="Rental Network"
      title="Reserve cameras, lenses, lights, and production gear without leaving your workflow."
      description="The page body now follows the Stitch rentals marketplace direction instead of a plain heading block."
      previewSrc="/stitch/rentals.png"
      previewAlt="Stitch camera rentals marketplace preview"
      primaryCta={{ href: "/contact", label: "Request a rental" }}
      secondaryCta={{ href: "/register", label: "Join RawDrive" }}
      filters={["Sony", "Canon", "Lights", "Lenses", "Mumbai", "Insurance ready"]}
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
