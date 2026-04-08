import type { Metadata } from "next";
import { Layers3, MonitorPlay, Users, Video } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "Live Streaming | RawDrive",
  description:
    "Offer premium, branded live-streaming options for remote guests straight from the RawDrive platform.",
};

export default function LiveStreamingPage() {
  return (
    <SolutionShowcasePage
      eyebrow="Live streaming"
      title="Stream weddings and events without dropping the premium visual language your studio is known for."
      description="The body of this page is now grounded in the Stitch feature showcase art direction instead of a generic text section."
      previewSrc="/stitch/solution-live.png"
      previewAlt="Stitch live-streaming showcase preview"
      previewLabel="Live streaming showcase"
      primaryCta={{ href: "/register", label: "Explore live streaming" }}
      secondaryCta={{ href: "/pricing", label: "Compare plans" }}
      stats={[
        { label: "Guests", value: "Remote friendly" },
        { label: "Branding", value: "On stream" },
        { label: "Replay", value: "Archive ready" },
      ]}
      features={[
        {
          icon: Video,
          title: "Broadcast-ready delivery",
          description:
            "Run event streams from the same product that already handles your galleries and clients.",
        },
        {
          icon: Layers3,
          title: "Branded overlays",
          description:
            "Keep your studio identity present instead of forcing viewers through a generic streaming container.",
        },
        {
          icon: Users,
          title: "Remote guest access",
          description:
            "Make it easy for family, collaborators, or clients to join from anywhere without production chaos.",
        },
        {
          icon: MonitorPlay,
          title: "Replay continuity",
          description:
            "Carry the live moment forward into final delivery with recordings and related event assets.",
        },
      ]}
      workflow={[
        {
          title: "Set the stream surface",
          description:
            "Use a polished launch point that matches the rest of the RawDrive client experience.",
        },
        {
          title: "Run branded live access",
          description:
            "Share access confidently with overlays, guest-ready links, and event-aware presentation.",
        },
        {
          title: "Archive the event",
          description:
            "Keep recordings and follow-up assets connected to the same project once the live moment ends.",
        },
      ]}
      quoteTitle="The original Stitch concept treated streaming as part of the studio product, not a bolt-on."
      quoteBody="That’s what this route does now too: it sits naturally beside galleries, booking, and delivery instead of looking like an afterthought."
    />
  );
}
