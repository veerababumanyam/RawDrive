import type { Metadata } from "next";
import { Layers3, MonitorPlay, Users, Video } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("live-streaming");

export default function LiveStreamingPage() {
  return (
    <SolutionShowcasePage
      eyebrow="Live streaming"
      title="Stream weddings and events without dropping the premium visual language your studio is known for."
      description="Package remote guest access, branded viewing, replay handling, and event context beside the rest of your studio workflow."
      previewSrc="/stitch/solution-live.png"
      previewAlt="RawDrive live-streaming workflow preview"
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
      answer="RawDrive live streaming is best for studios that want to offer branded remote viewing for weddings, ceremonies, and events while keeping stream links, replays, and client delivery in one system."
      quoteTitle="Streaming works better when it belongs to the same event workflow."
      quoteBody="RawDrive treats the live moment, replay, gallery, and client follow-up as one connected experience rather than a separate production link."
    />
  );
}
