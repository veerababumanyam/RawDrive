import type { Metadata } from "next";
import { CalendarDays, Clock3, MapPinned, Users } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "Calendar & Scheduling | RawDrive",
  description:
    "Integrate seamlessly with your business schedule for smooth bookings and project planning.",
};

export default function SchedulingPage() {
  return (
    <SolutionShowcasePage
      eyebrow="Scheduling"
      title="Keep shoots, planning, reminders, and client coordination inside one calendar surface."
      description="This page body now follows the Stitch booking-management screen instead of a plain title-and-paragraph placeholder."
      previewSrc="/stitch/solution-scheduling.png"
      previewAlt="Stitch scheduling dashboard preview"
      previewLabel="Booking management"
      primaryCta={{ href: "/register", label: "Manage studio schedules" }}
      secondaryCta={{ href: "/contact", label: "See the workflow" }}
      stats={[
        { label: "Bookings", value: "Studio wide" },
        { label: "Reminders", value: "Automated" },
        { label: "Coordination", value: "Client visible" },
      ]}
      features={[
        {
          icon: CalendarDays,
          title: "Job calendar",
          description:
            "See shoots, prep, deliveries, and deadlines in one clear schedule instead of disconnected reminders.",
        },
        {
          icon: Users,
          title: "Team alignment",
          description:
            "Keep photographers, assistants, and ops aligned on what is happening next and where.",
        },
        {
          icon: Clock3,
          title: "Reminder flow",
          description:
            "Reduce missed tasks and manual follow-ups with scheduling that supports the actual studio rhythm.",
        },
        {
          icon: MapPinned,
          title: "Location context",
          description:
            "Pair bookings with venue and travel context so the schedule feels operationally complete.",
        },
      ]}
      workflow={[
        {
          title: "Capture the booking",
          description:
            "Turn new inquiries into visible shoot entries the full studio can coordinate around.",
        },
        {
          title: "Track readiness",
          description:
            "Use the same surface for scheduling, reminders, and pre-shoot preparation details.",
        },
        {
          title: "Deliver with context",
          description:
            "Keep the calendar connected to galleries, invoices, and client follow-up instead of isolating it.",
        },
      ]}
      quoteTitle="The Stitch scheduling page already had a strong operational layout."
      quoteBody="This route now shows that structure on the live app, so it no longer falls back to an empty marketing stub."
    />
  );
}
