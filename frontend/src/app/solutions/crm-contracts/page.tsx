import type { Metadata } from "next";
import { FileSignature, ReceiptText, Users, Wallet } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("crm");

export default function CRMContractsPage() {
  return (
    <SolutionShowcasePage
      eyebrow="CRM and contracts"
      title="Track leads, lock bookings, send contracts, and keep billing in one studio system."
      description="Run inquiries, packages, contracts, GST-ready invoices, deposits, and follow-ups in the same workspace that handles delivery."
      previewSrc="/stitch/solution-crm.png"
      previewAlt="RawDrive CRM, contracts, and billing dashboard preview"
      previewLabel="CRM contacts dashboard"
      primaryCta={{ href: "/register", label: "Run your studio on RawDrive" }}
      secondaryCta={{ href: "/contact", label: "Talk to sales" }}
      stats={[
        { label: "Leads", value: "Pipeline ready" },
        { label: "Contracts", value: "E-sign enabled" },
        { label: "Billing", value: "GST aligned" },
      ]}
      features={[
        {
          icon: Users,
          title: "Lead visibility",
          description:
            "Track inquiries, status changes, and next actions inside one clean pipeline instead of scattered chats.",
        },
        {
          icon: FileSignature,
          title: "Contract flow",
          description:
            "Move from proposal to signed agreement without breaking the visual continuity of the studio workflow.",
        },
        {
          icon: ReceiptText,
          title: "GST-friendly invoices",
          description:
            "Generate billing artifacts that match how Indian studios actually operate and collect payments.",
        },
        {
          icon: Wallet,
          title: "Booking confidence",
          description:
            "Tie deposits, confirmations, and job readiness into one place so the business side stops lagging behind delivery.",
        },
      ]}
      workflow={[
        {
          title: "Capture the inquiry",
          description:
            "Turn leads into visible records with status, shoot details, and context the full team can act on.",
        },
        {
          title: "Send documents confidently",
          description:
            "Move through proposals, signatures, and billing without stitching together separate tools.",
        },
        {
          title: "Keep the project live",
          description:
            "Push bookings forward into calendars, galleries, and studio operations from the same platform.",
        },
      ]}
      answer="RawDrive CRM is best for photography studios that need to turn inquiries into booked projects, manage client context, send agreements, issue GST-aware invoices, and keep delivery connected to the business pipeline."
      quoteTitle="A studio CRM should know what happens after the deal closes."
      quoteBody="RawDrive connects leads, contracts, billing, calendars, and galleries so the client relationship stays visible from first inquiry through final delivery."
    />
  );
}
