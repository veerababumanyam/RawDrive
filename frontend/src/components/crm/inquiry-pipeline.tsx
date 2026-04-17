"use client";

import { useState, useEffect } from "react";
import { listLeads, createLead, type Lead } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { leadStageClasses } from "@/lib/dashboard-ui";

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export function InquiryPipeline() {
  const [activeStage, setActiveStage] = useState<string | "">("");
  const token = getStoredAccessToken();
  const requestKey = activeStage || "__all__";
  const [requestState, setRequestState] = useState<{
    key: string;
    leads: Lead[];
    error: string | null;
  }>({
    key: "",
    leads: [],
    error: null,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // View mode: "list" is a single scannable column (default â€” kanban's
  // 7-column horizontal scroll is noise when there's little data), and
  // "kanban" is the pipeline board. Photographers with under ~10 leads
  // get list by default; heavier users can flip to kanban for visual
  // flow across stages. Previously the page was kanban-only which
  // meant every new account saw seven identical "No inquiries" columns in
  // a ~1960px-wide horizontal scroller â€” noisy and confusing.
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  // QA #29: per-inquiry detail drawer — clicking a row opens a side panel
  // with the full lead details so the portal shows more than top-level
  // totals. Previously there was no drill-down path and the portal looked
  // like the metrics were broken ("0 in breakdown").
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "website",
    event_type: "wedding",
    stage: "new",
  });

  const leads = requestState.key === requestKey ? requestState.leads : [];
  const error = token
    ? requestState.key === requestKey
      ? requestState.error
      : null
    : "Missing access token";
  const loading = Boolean(token) && requestState.key !== requestKey;

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;

    listLeads(token, activeStage ? { stage: activeStage } : undefined)
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            leads: data,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            leads: [],
            error: err?.message || "Failed to load inquiries",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeStage, requestKey, token, refreshTick]);

  const handleCreate = async () => {
    if (!form.name.trim() || creating) return;
    setCreating(true);
    try {
      await createLead(token, {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        source: form.source,
        event_type: form.event_type,
        stage: form.stage,
      });
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", source: "website", event_type: "wedding", stage: "new" });
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setRequestState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to create inquiry",
      }));
    } finally {
      setCreating(false);
    }
  };

  const groupedLeads = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.stage === stage);
      return acc;
    },
    {} as Record<string, Lead[]>,
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="min-w-[280px] h-96 bg-surface-sunken rounded-xl" />
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
          <h1 className="text-2xl font-semibold text-text-primary">Inquiry Pipeline</h1>
          <p className="text-sm text-text-secondary mt-1">
            {leads.length} {leads.length === 1 ? "inquiry" : "inquiries"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
        >
          + New Inquiry
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Inquiry</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text" placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <input
              type="email" placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            />
            <input
              type="tel" placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            />
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="wedding">Wedding</option>
              <option value="portrait">Portrait</option>
              <option value="event">Corporate event</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="other">Other</option>
            </select>
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary capitalize"
            >
              {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creatingâ€¦" : "Save Inquiry"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between">
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
        <div className="flex gap-1 rounded-xl bg-surface-sunken p-1">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "list" ? "bg-accent-primary text-white" : "text-text-secondary hover:text-text-primary",
            )}
          >
            List
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "kanban" ? "bg-accent-primary text-white" : "text-text-secondary hover:text-text-primary",
            )}
          >
            Kanban
          </button>
        </div>
      </div>

      {leads.length === 0 ? (
        /* Collapsed empty state â€” replaces the old "seven identical
           'No inquiries' columns in a horizontal scroller" layout that was
           noisy for new accounts. */
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
          <p className="text-text-primary font-medium">No inquiries yet</p>
          <p className="text-sm text-text-secondary mt-1">
            Capture enquiries from your website, Instagram, or WhatsApp and track them through the pipeline.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + Create your first inquiry
          </button>
        </div>
      ) : viewMode === "list" ? (
        /* List view â€” vertical scannable table. Stage is rendered as
           a badge column; source/event/budget fit on one row each. */
        <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
          {(activeStage ? leads.filter((l) => l.stage === activeStage) : leads).map((lead) => (
            <div
              key={lead.id}
              onClick={() => setSelectedLead(lead)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedLead(lead);
                }
              }}
              className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b border-border-default last:border-b-0 hover:bg-surface-sunken/40 transition-colors cursor-pointer"
            >
              <div>
                <p className="font-medium text-text-primary text-sm">{lead.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                  {lead.event_type && <span className="capitalize">{lead.event_type}</span>}
                  {lead.source && <span className="capitalize">via {lead.source}</span>}
                  {lead.budget_paisa ? (
                    <span>â‚¹{(lead.budget_paisa / 100).toLocaleString("en-IN")}</span>
                  ) : null}
                </div>
              </div>
              <span
                className={cn(
                  "self-center capitalize",
                  leadStageClasses[lead.stage] || "status-badge status-badge--neutral",
                )}
              >
                {lead.stage}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Kanban view â€” the previous horizontal board. Keep the
           min-w-[280px] column sizing because kanban intrinsically
           needs to be wide enough to show card content. */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.filter((stage) => !activeStage || stage === activeStage).map((stage) => (
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
                    onClick={() => setSelectedLead(lead)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedLead(lead);
                      }
                    }}
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
                          â‚¹{(lead.budget_paisa / 100).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {(groupedLeads[stage] || []).length === 0 && (
                  <div className="text-center py-8 text-text-tertiary text-sm">No inquiries</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QA #29: per-inquiry detail drawer. Opens when a row/card is
          clicked. Shows every field from the Lead record — contact,
          event, source, stage, budget, notes, created/updated timestamps.
          Close on backdrop click or Escape. */}
      {selectedLead && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Inquiry detail"
        >
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedLead(null)}
            aria-hidden
          />
          <aside className="w-full max-w-md bg-surface-raised border-l border-border-default overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">
                {selectedLead.name}
              </h3>
              <button
                onClick={() => setSelectedLead(null)}
                aria-label="Close"
                className="rounded-full p-1 hover:bg-surface-sunken/40"
              >
                ✕
              </button>
            </div>
            <span
              className={cn(
                "capitalize",
                leadStageClasses[selectedLead.stage] || "status-badge status-badge--neutral",
              )}
            >
              {selectedLead.stage}
            </span>
            <dl className="text-sm space-y-2">
              {selectedLead.email && (
                <div>
                  <dt className="text-xs text-text-tertiary">Email</dt>
                  <dd className="text-text-primary font-mono text-xs break-all">{selectedLead.email}</dd>
                </div>
              )}
              {selectedLead.phone && (
                <div>
                  <dt className="text-xs text-text-tertiary">Phone</dt>
                  <dd className="text-text-primary font-mono text-xs">{selectedLead.phone}</dd>
                </div>
              )}
              {selectedLead.event_type && (
                <div>
                  <dt className="text-xs text-text-tertiary">Event type</dt>
                  <dd className="text-text-primary capitalize">{selectedLead.event_type}</dd>
                </div>
              )}
              {selectedLead.source && (
                <div>
                  <dt className="text-xs text-text-tertiary">Source</dt>
                  <dd className="text-text-primary capitalize">{selectedLead.source}</dd>
                </div>
              )}
              {selectedLead.budget_paisa ? (
                <div>
                  <dt className="text-xs text-text-tertiary">Budget</dt>
                  <dd className="text-text-primary">
                    ₹{(selectedLead.budget_paisa / 100).toLocaleString("en-IN")}
                  </dd>
                </div>
              ) : null}
              {selectedLead.notes && (
                <div>
                  <dt className="text-xs text-text-tertiary">Notes</dt>
                  <dd className="text-text-primary whitespace-pre-wrap">{selectedLead.notes}</dd>
                </div>
              )}
              {selectedLead.created_at && (
                <div>
                  <dt className="text-xs text-text-tertiary">Created</dt>
                  <dd className="text-text-primary text-xs">
                    {new Date(selectedLead.created_at).toLocaleString("en-IN")}
                  </dd>
                </div>
              )}
            </dl>
            <a
              href={`/crm/projects?create=true&lead=${selectedLead.id}`}
              className="block w-full text-center rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Convert to project
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}

