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
        <div
          role="tablist"
          aria-label="Inquiry sources"
          className="flex w-fit gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pipeline"}
            onClick={() => setTab("pipeline")}
            className={cn(
              "segmented-control-button whitespace-nowrap text-sm",
              tab === "pipeline"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
          >
            Pipeline
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "marketplace"}
            onClick={() => setTab("marketplace")}
            className={cn(
              "segmented-control-button whitespace-nowrap text-sm",
              tab === "marketplace"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
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
