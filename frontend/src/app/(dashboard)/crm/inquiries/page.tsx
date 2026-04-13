"use client";

import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { InquiryPipeline } from "@/components/crm/inquiry-pipeline";

export default function InquiriesPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-7xl px-4 pt-8">
        <CRMSecondaryNav />
      </div>
      <InquiryPipeline />
    </div>
  );
}
