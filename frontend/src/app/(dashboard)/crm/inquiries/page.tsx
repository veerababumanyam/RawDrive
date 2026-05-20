"use client";

import { useState } from "react";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { InquiryPipeline } from "@/components/crm/inquiry-pipeline";
import { MarketplaceInquiriesPanel } from "@/components/crm/marketplace-inquiries-panel";
import { cn } from "@/lib/utils";

type Tab = "pipeline" | "marketplace";

export default function InquiriesPage() {
  const [tab, setTab] = useState<Tab>("pipeline");

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-7xl px-4 pt-8">
        <CRMSecondaryNav />
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="flex gap-1 rounded-xl bg-surface-sunken p-1 w-fit">
          <button
            onClick={() => setTab("pipeline")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === "pipeline"
                ? "bg-surface-raised text-on-surface shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            Pipeline
          </button>
          <button
            onClick={() => setTab("marketplace")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === "marketplace"
                ? "bg-surface-raised text-on-surface shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            Marketplace Inquiries
          </button>
        </div>
      </div>

      {tab === "pipeline" ? (
        <InquiryPipeline />
      ) : (
        <div className="mx-auto max-w-7xl px-4 pb-8">
          <MarketplaceInquiriesPanel />
        </div>
      )}
    </div>
  );
}
