"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listLeads, createLead, type Lead } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { leadStageClasses } from "@/lib/dashboard-ui";
import { Grid, ListBullet, Plus, XMark } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";

const STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

const FIELD_CLASS = "input-base w-full text-sm";

function formatBudget(paisa: number) {
  return "\u20B9" + (paisa / 100).toLocaleString("en-IN");
}

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
  // View mode: "list" is a single scannable column (default; kanban's
  // 7-column horizontal scroll is noise when there's little data), and
  // "kanban" is the pipeline board. Photographers with under ~10 leads
  // get list by default; heavier users can flip to kanban for visual
  // flow across stages. Previously the page was kanban-only which
  // meant every new account saw seven identical "No inquiries" columns in
  // a wide horizontal scroller: noisy and confusing.
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
      setForm({
        name: "",
        email: "",
        phone: "",
        source: "website",
        event_type: "wedding",
        stage: "new",
      });
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
        <div className="surface-panel animate-pulse space-y-4 p-6">
          <div className="h-8 w-48 rounded-xl bg-surface-container-low" />
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-96 min-w-72 rounded-xl bg-surface-container-low"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="inquiry-pipeline-title"
      className="mx-auto max-w-7xl px-4 py-8"
    >
      <div className="surface-panel space-y-6 p-5 sm:p-6">
        {error && (
          <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1
              id="inquiry-pipeline-title"
              className="text-2xl font-semibold text-text-primary"
            >
              Inquiry Pipeline
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {leads.length} {leads.length === 1 ? "inquiry" : "inquiries"}
            </p>
          </div>
          <GlassButton
            type="button"
            onClick={() => setShowCreate(true)}
            variant="primary"
            icon={<Plus aria-hidden="true" />}
          >
            New Inquiry
          </GlassButton>
        </div>

        {showCreate && (
          <div className="glass-card space-y-4 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              New Inquiry
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                aria-label="Inquiry name"
                placeholder="Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={FIELD_CLASS}
                autoFocus
              />
              <input
                type="email"
                aria-label="Inquiry email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={FIELD_CLASS}
              />
              <input
                type="tel"
                aria-label="Inquiry phone"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={FIELD_CLASS}
              />
              <select
                aria-label="Inquiry event type"
                value={form.event_type}
                onChange={(e) =>
                  setForm({ ...form, event_type: e.target.value })
                }
                className={FIELD_CLASS}
              >
                <option value="wedding">Wedding</option>
                <option value="portrait">Portrait</option>
                <option value="event">Corporate event</option>
                <option value="commercial">Commercial</option>
                <option value="other">Other</option>
              </select>
              <select
                aria-label="Inquiry source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className={FIELD_CLASS}
              >
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Other</option>
              </select>
              <select
                aria-label="Inquiry stage"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
                className={cn(FIELD_CLASS, "capitalize")}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <GlassButton
                type="button"
                onClick={() => setShowCreate(false)}
                variant="surface"
                disabled={creating}
              >
                Cancel
              </GlassButton>
              <GlassButton
                type="button"
                onClick={handleCreate}
                disabled={creating || !form.name.trim()}
                variant="primary"
              >
                {creating ? "Creating..." : "Save Inquiry"}
              </GlassButton>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-wrap gap-3 items-center justify-between">
          <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-2">
            <button
              type="button"
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
                type="button"
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
          <div
            role="radiogroup"
            aria-label="Inquiry view mode"
            className="glass-surface inline-flex shrink-0 items-center gap-1 rounded-full p-1"
          >
            <GlassIconButton
              type="button"
              label="List view"
              size="md"
              variant={viewMode === "list" ? "accent" : "glass"}
              active={viewMode === "list"}
              role="radio"
              aria-checked={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              <ListBullet aria-hidden="true" />
            </GlassIconButton>
            <GlassIconButton
              type="button"
              label="Kanban view"
              size="md"
              variant={viewMode === "kanban" ? "accent" : "glass"}
              active={viewMode === "kanban"}
              role="radio"
              aria-checked={viewMode === "kanban"}
              onClick={() => setViewMode("kanban")}
            >
              <Grid aria-hidden="true" />
            </GlassIconButton>
          </div>
        </div>

        {leads.length === 0 ? (
          /* Collapsed empty state: replaces the old "seven identical
           'No inquiries' columns in a horizontal scroller" layout that was
           noisy for new accounts. */
          <div className="rounded-xl border border-dashed border-border-default bg-surface-container-low/50 p-10 text-center">
            <p className="text-text-primary font-medium">No inquiries yet</p>
            <p className="text-sm text-text-secondary mt-1">
              Capture enquiries from your website, Instagram, or WhatsApp and
              track them through the pipeline.
            </p>
            <GlassButton
              type="button"
              onClick={() => setShowCreate(true)}
              variant="primary"
              icon={<Plus aria-hidden="true" />}
              className="mt-4"
            >
              Create your first inquiry
            </GlassButton>
          </div>
        ) : viewMode === "list" ? (
          /* List view: vertical scannable table. Stage is rendered as
           a badge column; source/event/budget fit on one row each. */
          <div className="overflow-hidden rounded-xl border border-border-default bg-surface-raised">
            {(activeStage
              ? leads.filter((l) => l.stage === activeStage)
              : leads
            ).map((lead) => (
              <button
                type="button"
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className="flex w-full items-center justify-between gap-3 border-b border-border-default px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-sunken/40"
              >
                <div>
                  <p className="font-medium text-text-primary text-sm">
                    {lead.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                    {lead.event_type && (
                      <span className="capitalize">{lead.event_type}</span>
                    )}
                    {lead.source && (
                      <span className="capitalize">via {lead.source}</span>
                    )}
                    {lead.budget_paisa ? (
                      <span>{formatBudget(lead.budget_paisa)}</span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={cn(
                    "self-center capitalize",
                    leadStageClasses[lead.stage] ||
                      "status-badge status-badge--neutral",
                  )}
                >
                  {lead.stage}
                </span>
              </button>
            ))}
          </div>
        ) : (
          /* Kanban view: the previous horizontal board. Keep the
           wide column sizing because kanban intrinsically
           needs to be wide enough to show card content. */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.filter(
              (stage) => !activeStage || stage === activeStage,
            ).map((stage) => (
              <div key={stage} className="min-w-72 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={cn(
                      "capitalize",
                      leadStageClasses[stage] ||
                        "status-badge status-badge--neutral",
                    )}
                  >
                    {stage}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {groupedLeads[stage]?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(groupedLeads[stage] || []).map((lead) => (
                    <button
                      type="button"
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="w-full rounded-xl border border-border-default bg-surface-raised p-3 text-left transition-colors hover:border-accent-primary/30 hover:bg-surface-sunken/40"
                    >
                      <p className="font-medium text-text-primary text-sm">
                        {lead.name}
                      </p>
                      {lead.event_type && (
                        <p className="text-xs text-text-secondary mt-1 capitalize">
                          {lead.event_type}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {lead.source && (
                          <span className="text-xs text-text-tertiary capitalize">
                            {lead.source}
                          </span>
                        )}
                        {lead.budget_paisa && (
                          <span className="text-xs text-text-tertiary">
                            {formatBudget(lead.budget_paisa)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {(groupedLeads[stage] || []).length === 0 && (
                    <div className="text-center py-8 text-text-tertiary text-sm">
                      No inquiries
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* QA #29: per-inquiry detail drawer. Opens when a row/card is
          clicked. Shows every field from the Lead record: contact,
          event, source, stage, budget, notes, created/updated timestamps.
          Close on backdrop click or Escape. */}
        {selectedLead && (
          <div
            className="z-modal-layer fixed inset-0 flex"
            role="dialog"
            aria-modal="true"
            aria-label="Inquiry detail"
          >
            <div
              className="modal-backdrop flex-1"
              onClick={() => setSelectedLead(null)}
              aria-hidden
            />
            <aside className="glass-card h-full w-full max-w-md overflow-y-auto rounded-none border-y-0 border-r-0 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-text-primary">
                  {selectedLead.name}
                </h3>
                <GlassIconButton
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  label="Close inquiry detail"
                  size="md"
                  variant="ghost"
                >
                  <XMark aria-hidden="true" />
                </GlassIconButton>
              </div>
              <span
                className={cn(
                  "capitalize",
                  leadStageClasses[selectedLead.stage] ||
                    "status-badge status-badge--neutral",
                )}
              >
                {selectedLead.stage}
              </span>
              <dl className="text-sm space-y-2">
                {selectedLead.email && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Email</dt>
                    <dd className="text-text-primary font-mono text-xs break-all">
                      {selectedLead.email}
                    </dd>
                  </div>
                )}
                {selectedLead.phone && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Phone</dt>
                    <dd className="text-text-primary font-mono text-xs">
                      {selectedLead.phone}
                    </dd>
                  </div>
                )}
                {selectedLead.event_type && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Event type</dt>
                    <dd className="text-text-primary capitalize">
                      {selectedLead.event_type}
                    </dd>
                  </div>
                )}
                {selectedLead.source && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Source</dt>
                    <dd className="text-text-primary capitalize">
                      {selectedLead.source}
                    </dd>
                  </div>
                )}
                {selectedLead.budget_paisa ? (
                  <div>
                    <dt className="text-xs text-text-tertiary">Budget</dt>
                    <dd className="text-text-primary">
                      {formatBudget(selectedLead.budget_paisa)}
                    </dd>
                  </div>
                ) : null}
                {selectedLead.notes && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Notes</dt>
                    <dd className="text-text-primary whitespace-pre-wrap">
                      {selectedLead.notes}
                    </dd>
                  </div>
                )}
                {selectedLead.created_at && (
                  <div>
                    <dt className="text-xs text-text-tertiary">Created</dt>
                    <dd className="text-text-primary text-xs">
                      {new Date(selectedLead.created_at).toLocaleString(
                        "en-IN",
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <Link
                href={`/crm/projects?create=true&lead=${selectedLead.id}`}
                className="glass-button glass-button--primary glass-button--md w-full"
              >
                <span>Convert to project</span>
              </Link>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
