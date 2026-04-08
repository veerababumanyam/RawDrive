import type { Metadata } from "next";
import { FileSignature, ReceiptText, Users, Wallet } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "CRM & Contracts | RawDrive",
  description:
    "Manage your client base, seal the deal with secure electronic contracts, and simplify GST-ready billing.",
};

export default function CRMContractsPage() {
  return (
    <SolutionShowcasePage
      eyebrow="CRM and contracts"
      title="Track leads, lock bookings, send contracts, and keep billing in one studio system."
      description="This page body is rebuilt from the Stitch CRM direction so the route now reflects the real product surfaces behind it."
      previewSrc="/stitch/solution-crm.png"
      previewAlt="Stitch CRM and contacts preview"
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
      quoteTitle="This route now feels like part of the product instead of a dead-end stub."
      quoteBody="The content is grounded in the Stitch CRM export so users can see the actual operational story behind RawDrive, not just a generic headline."
    />
  );
}
