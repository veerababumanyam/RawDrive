import type { Metadata } from "next";
import { MarketplaceShowcasePage } from "@/components/marketing/MarketplaceShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("freelancer-marketplace");

export default function FreelancerMarketplacePage() {
  return (
    <MarketplaceShowcasePage
      path="/marketplaces/freelancer"
      breadcrumbName="Freelancers"
      eyebrow="Marketplace"
      title="Find second shooters, editors, and specialists without leaving RawDrive."
      description="Discover photography talent by city, specialty, availability, and project fit so your studio can staff weddings, events, edits, and drone work faster."
      previewSrc="/marketing/rawdrive-freelancer-marketplace.avif"
      previewAlt="RawDrive freelancer marketplace preview"
      primaryCta={{ href: "/register", label: "Create your profile" }}
      secondaryCta={{ href: "/contact", label: "Talk to our team" }}
      filters={[
        "Mumbai",
        "Wedding",
        "Portrait",
        "Drone",
        "Retouching",
        "Top rated",
      ]}
      answer="RawDrive's freelancer marketplace is best for studios that need trusted second shooters, editors, drone operators, and specialists for Indian wedding, event, portrait, and commercial photography projects."
      cards={[
        {
          name: "Aarav Mehta",
          location: "Mumbai",
          specialty: "Wedding and candid specialist",
          badge: "Featured",
          price: "4.9 rating",
          image: "/marketing/rawdrive-freelancer-card-1.avif",
          note: "Available for second-shooting, same-day edits, and premium client handling.",
        },
        {
          name: "Simran Kaur",
          location: "Chandigarh",
          specialty: "Portrait and fashion retouching",
          badge: "Editor",
          price: "Starts Rs. 7k",
          image: "/marketing/rawdrive-freelancer-card-2.avif",
          note: "Fast-turnaround color grading and skin-retouch pipelines for editorial work.",
        },
        {
          name: "Vikram Rao",
          location: "Bengaluru",
          specialty: "Drone and event coverage",
          badge: "On site",
          price: "4.8 rating",
          image: "/marketing/rawdrive-freelancer-card-3.avif",
          note: "Covers large-format events and hybrid production days with drone support.",
        },
      ]}
    />
  );
}
