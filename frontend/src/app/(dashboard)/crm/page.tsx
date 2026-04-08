"use client";

import { useState, useEffect } from "react";
import { listLeads, type Lead } from "@/lib/api/crm";

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

const stageColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600",
  contacted: "bg-yellow-500/10 text-yellow-600",
  qualified: "bg-purple-500/10 text-purple-600",
  proposal: "bg-orange-500/10 text-orange-600",
  negotiation: "bg-cyan-500/10 text-cyan-600",
  won: "bg-green-500/10 text-green-600",
  lost: "bg-red-500/10 text-red-600",
};

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<string | "">("");

  useEffect(() => {
    const token = "";
    listLeads(token, activeStage ? { stage: activeStage } : undefined)
      .then(setLeads)
      .catch(() => setLeads([]))
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
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeStage === "" ? "bg-accent text-white" : "bg-surface-raised text-text-secondary hover:bg-surface-sunken"
          }`}
        >
          All
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
              activeStage === stage ? "bg-accent text-white" : "bg-surface-raised text-text-secondary hover:bg-surface-sunken"
            }`}
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
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${stageColors[stage]}`}>
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
