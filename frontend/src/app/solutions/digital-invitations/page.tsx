import type { Metadata } from "next";
import { CalendarHeart, ImageIcon, Send, Smartphone } from "@/components/icons";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("digital-invitations");

export default function DigitalInvitationsPage() {
  return (
    <SolutionShowcasePage
      path="/solutions/digital-invitations"
      eyebrow="Digital invitations"
      title="Turn invitations into a polished extension of the same brand experience your gallery clients already trust."
      description="Create mobile-first invitation and event touchpoints that connect guest communication, RSVP context, gallery reveal, and studio branding."
      previewSrc="/marketing/rawdrive-digital-invitations.avif"
      previewAlt="RawDrive digital invitation and event microsite preview"
      previewLabel="Invitation showcase"
      primaryCta={{ href: "/register", label: "Launch invitation flows" }}
      secondaryCta={{ href: "/contact", label: "Request a demo" }}
      stats={[
        { label: "RSVP", value: "Centralized" },
        { label: "Branding", value: "Studio aligned" },
        { label: "Delivery", value: "Mobile first" },
      ]}
      features={[
        {
          icon: CalendarHeart,
          title: "Event storytelling",
          description:
            "Carry the tone of the event across invitations, gallery previews, and follow-up communication.",
        },
        {
          icon: Send,
          title: "Managed outreach",
          description:
            "Send updates and reminders from the same system that tracks delivery and client relationships.",
        },
        {
          icon: Smartphone,
          title: "Phone-native experience",
          description:
            "Invitation flows are designed for the device where guests actually open and share them.",
        },
        {
          icon: ImageIcon,
          title: "Visual continuity",
          description:
            "Use the same photography-led design language across invites, proofing, and premium delivery pages.",
        },
      ]}
      workflow={[
        {
          title: "Design the first touchpoint",
          description:
            "Start with a polished event surface instead of treating invitations like a disconnected side tool.",
        },
        {
          title: "Track responses",
          description:
            "Keep communication and attendance context close to the rest of the client and event workflow.",
        },
        {
          title: "Continue into delivery",
          description:
            "Move from invite to live event to gallery reveal without losing the sense of one coherent brand experience.",
        },
      ]}
      answer="RawDrive digital invitations are best for studios that want premium event microsites, guest communication, RSVP context, and branded touchpoints connected to the rest of the photography delivery workflow."
      quoteTitle="The first guest touchpoint should feel as polished as the final gallery."
      quoteBody="RawDrive keeps invitations, event communication, gallery delivery, and studio identity in the same premium product language."
    />
  );
}
