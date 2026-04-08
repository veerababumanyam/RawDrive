import type { Metadata } from "next";
import { CheckCircle2, ImageIcon, ShieldCheck, Smartphone } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "Client Galleries & Portfolios | RawDrive",
  description: "Deliver stunning, branded galleries directly to your clients with PWAs.",
};

export default function ClientGalleriesPage() {
  return (
    <SolutionShowcasePage
      eyebrow="Client Galleries"
      title="Deliver galleries that feel handcrafted, branded, and ready for client approval."
      description="This body now uses the original Stitch gallery-management direction, while keeping the application navbar and footer untouched."
      previewSrc="/stitch/solution-galleries.png"
      previewAlt="Stitch gallery management preview"
      previewLabel="Gallery management dashboard"
      primaryCta={{ href: "/register", label: "Start free trial" }}
      secondaryCta={{ href: "/pricing", label: "See pricing" }}
      stats={[
        { label: "Delivery", value: "Minutes, not days" },
        { label: "Branding", value: "Studio-first" },
        { label: "Proofing", value: "Client ready" },
      ]}
      features={[
        {
          icon: ImageIcon,
          title: "Branded presentation",
          description:
            "Custom covers, polished layouts, and studio identity built into every delivery touchpoint.",
        },
        {
          icon: CheckCircle2,
          title: "Approval workflows",
          description:
            "Clients can favorite, shortlist, and confirm selections without bouncing between apps.",
        },
        {
          icon: ShieldCheck,
          title: "Controlled access",
          description:
            "Passwords, expiry windows, download rules, and private sharing all live inside one flow.",
        },
        {
          icon: Smartphone,
          title: "Mobile experience",
          description:
            "The gallery experience remains premium on phones, where most clients actually review work.",
        },
      ]}
      workflow={[
        {
          title: "Upload and organize",
          description:
            "Move raw delivery sets into the correct collection structure without building a second system around them.",
        },
        {
          title: "Share a premium link",
          description:
            "Send one branded destination instead of a messy folder or generic cloud bucket.",
        },
        {
          title: "Collect selections",
          description:
            "Turn favorites and approvals into actionable next steps for editing, invoicing, or final export.",
        },
      ]}
      quoteTitle="The original Stitch screen was built around a gallery-first dashboard."
      quoteBody="This page now reflects that same direction: visual presentation first, operational control second, and none of the old blank-section filler."
    />
  );
}
