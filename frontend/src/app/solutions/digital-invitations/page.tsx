import type { Metadata } from "next";
import { CalendarHeart, ImageIcon, Send, Smartphone } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "Digital Invitations & DVC | RawDrive",
  description:
    "Create incredible digital invitations and manage your Digital Visiting Card as a modern creative.",
};

export default function DigitalInvitationsPage() {
  return (
    <SolutionShowcasePage
      eyebrow="Digital invitations"
      title="Turn invitations into a polished extension of the same brand experience your gallery clients already trust."
      description="This route now takes its visual body from the Stitch feature showcase work instead of a plain placeholder block."
      previewSrc="/stitch/solution-invitations.png"
      previewAlt="Stitch digital invitations showcase preview"
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
      quoteTitle="The Stitch showcase work already had the right premium tone."
      quoteBody="This route now leans into that original direction so it feels like part of a premium photography platform instead of a forgotten page."
    />
  );
}
