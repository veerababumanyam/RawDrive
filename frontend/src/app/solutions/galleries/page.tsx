import type { Metadata } from "next";
import {
  CheckCircle2,
  ImageIcon,
  ShieldCheck,
  Smartphone,
} from "@/components/icons";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("galleries");

export default function ClientGalleriesPage() {
  return (
    <SolutionShowcasePage
      path="/solutions/galleries"
      eyebrow="Client Galleries"
      title="Deliver galleries that feel handcrafted, branded, and ready for client approval."
      description="Give every wedding, event, or portrait client a polished gallery link with proofing, expiry, download control, and studio branding built in."
      previewSrc="/stitch/solution-galleries.png"
      previewAlt="RawDrive gallery management dashboard preview"
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
      answer="RawDrive client galleries are best for studios that need premium photo delivery, client selections, controlled downloads, and mobile-first proofing without sending clients to generic cloud folders."
      quoteTitle="Gallery delivery should feel premium before it feels technical."
      quoteBody="RawDrive keeps visual presentation, proofing, access rules, and follow-up work together so client delivery becomes part of the studio workflow instead of a separate handoff."
    />
  );
}
