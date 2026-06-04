import type { Metadata } from "next";
import { CalendarDays, Clock3, MapPinned, Users } from "@/components/icons";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("scheduling");

export default function SchedulingPage() {
  return (
    <SolutionShowcasePage
      path="/solutions/scheduling"
      eyebrow="Scheduling"
      title="Keep shoots, planning, reminders, and client coordination inside one calendar surface."
      description="Coordinate event dates, teams, venues, client milestones, and delivery tasks without separating the calendar from the rest of the studio."
      previewSrc="/stitch/solution-scheduling.png"
      previewAlt="RawDrive scheduling and booking dashboard preview"
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
      answer="RawDrive scheduling is best for studios that manage multiple shoots, team members, venues, reminders, and client deadlines across weddings, events, and commercial projects."
      quoteTitle="The calendar should understand the whole job."
      quoteBody="RawDrive keeps dates, preparation, project context, invoices, galleries, and follow-up work close enough that teams can act without hunting through separate tools."
    />
  );
}
