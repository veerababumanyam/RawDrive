"use client";

import { useState, useEffect } from "react";
import { listLeads, type Lead } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { leadStageClasses } from "@/lib/dashboard-ui";

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | "">("");

  useEffect(() => {
    const token = getStoredAccessToken();
    setLoading(true);
    listLeads(token, activeStage ? { stage: activeStage } : undefined)
      .then(setLeads)
      .catch((err) => { setError(err?.message || "Failed to load leads"); setLeads([]); })
      .finally(() => setLoading(false));
  }, [activeStage]);

  const groupedLeads = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = leads.filter((l) => l.stage === stage);
      return acc;
    },
    {} as Record<string, Lead[]>
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="min-w-[280px] h-96 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Lead Pipeline</h1>
          <p className="text-sm text-text-secondary mt-1">
            {leads.length} {leads.length === 1 ? "lead" : "leads"}
          </p>
        </div>
      </div>

      {/* Stage filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveStage("")}
          className={cn(
            "segmented-control-button whitespace-nowrap text-sm",
            activeStage === ""
              ? "segmented-control-button--active"
              : "segmented-control-button--inactive",
          )}
        >
          All
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={cn(
              "segmented-control-button whitespace-nowrap text-sm capitalize",
              activeStage === stage
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
          >
            {stage} ({groupedLeads[stage]?.length || 0})
          </button>
        ))}
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.filter((s) => !activeStage || s === activeStage).map((stage) => (
          <div key={stage} className="min-w-[280px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <span
                className={cn(
                  "capitalize",
                  leadStageClasses[stage] || "status-badge status-badge--neutral",
                )}
              >
                {stage}
              </span>
              <span className="text-xs text-text-tertiary">{groupedLeads[stage]?.length || 0}</span>
            </div>
            <div className="space-y-2">
              {(groupedLeads[stage] || []).map((lead) => (
                <div
                  key={lead.id}
                  className="bg-surface-raised rounded-xl p-3 border border-border-default hover:border-accent/30 transition-colors cursor-pointer"
                >
                  <p className="font-medium text-text-primary text-sm">{lead.name}</p>
                  {lead.event_type && (
                    <p className="text-xs text-text-secondary mt-1 capitalize">{lead.event_type}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {lead.source && (
                      <span className="text-xs text-text-tertiary capitalize">{lead.source}</span>
                    )}
                    {lead.budget_paisa && (
                      <span className="text-xs text-text-tertiary">
                        ₹{(lead.budget_paisa / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {(groupedLeads[stage] || []).length === 0 && (
                <div className="text-center py-8 text-text-tertiary text-sm">No leads</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
