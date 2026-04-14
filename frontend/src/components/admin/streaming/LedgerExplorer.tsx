"use client";

// M35/35-7 — Super-admin streaming ledger explorer.
//
// Lists every streaming_ledger_entries row across all workspaces, with
// filter (workspace, actor, entry type, date range), keyset pagination
// (next_cursor) and a CSV export that respects X-Truncated.
//
// Strictly super-admin: the page route guards via session cookie role
// check; this component additionally fails closed if the API returns 403.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  fetchLedger,
  exportLedgerCSV,
  LEDGER_ENTRY_TYPES,
  type LedgerFilters,
  type LedgerRow,
} from "@/lib/streaming/ledger";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Download, Funnel, XMark } from "@/components/icons";

const PAGE_SIZE = 100;

interface FilterDraft {
  workspace: string;
  actor: string;
  entryType: string; // "" = all, otherwise a single LedgerEntryType
  from: string; // datetime-local
  to: string;
  search: string;
}

const EMPTY_DRAFT: FilterDraft = {
  workspace: "",
  actor: "",
  entryType: "",
  from: "",
  to: "",
  search: "",
};

function draftToFilters(d: FilterDraft, cursor?: string): LedgerFilters {
  const f: LedgerFilters = { limit: PAGE_SIZE };
  if (d.workspace.trim()) f.workspace = d.workspace.trim();
  if (d.actor.trim()) f.actor = d.actor.trim();
  if (d.entryType) f.entryTypes = [d.entryType];
  if (d.from) f.from = new Date(d.from).toISOString();
  if (d.to) f.to = new Date(d.to).toISOString();
  if (d.search.trim()) f.search = d.search.trim();
  if (cursor) f.cursor = cursor;
  return f;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function LedgerExplorer() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_DRAFT);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const token = useMemo(() => getStoredAccessToken() || "", []);

  const load = useCallback(
    async (next: FilterDraft, cursor?: string, append = false) => {
      try {
        setLoading(true);
        setError(null);
        const page = await fetchLedger(token, draftToFilters(next, cursor));
        setRows((prev) => (append ? [...prev, ...page.rows] : page.rows));
        setNextCursor(page.next_cursor);
      } catch (e) {
        setError(`Failed to load ledger: ${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(EMPTY_DRAFT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApply = () => {
    setApplied(draft);
    void load(draft);
  };

  const onReset = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(EMPTY_DRAFT);
    void load(EMPTY_DRAFT);
  };

  const onLoadMore = () => {
    if (!nextCursor) return;
    void load(applied, nextCursor, true);
  };

  const onExport = async () => {
    try {
      setExporting(true);
      setExportNotice(null);
      const result = await exportLedgerCSV(token, draftToFilters(applied));
      if (result.truncated) {
        setExportNotice(
          "Export was truncated at the 100,000-row hard cap — narrow your filters and re-export to capture the full window.",
        );
      } else {
        setExportNotice(`Exported ${result.filename}`);
      }
    } catch (e) {
      setExportNotice(`CSV export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
          Streaming Ledger
        </h2>
        <p className="text-text-secondary font-body text-sm">
          Audit every credit, debit, refund, adjustment, and fee posted across
          all workspaces. Exports are recorded in <code>admin_audit</code>.
        </p>
      </header>

      {/* Filter bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-2xl
          bg-surface-container-low/40 border border-white/[0.03]"
      >
        <Field label="Workspace ID" htmlFor="ledger-workspace">
          <input
            id="ledger-workspace"
            type="text"
            value={draft.workspace}
            onChange={(e) => setDraft({ ...draft, workspace: e.target.value })}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="ledger-input"
          />
        </Field>
        <Field label="Actor (user UUID)" htmlFor="ledger-actor">
          <input
            id="ledger-actor"
            type="text"
            value={draft.actor}
            onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
            placeholder="user UUID"
            className="ledger-input"
          />
        </Field>
        <Field label="Entry type" htmlFor="ledger-type">
          <select
            id="ledger-type"
            value={draft.entryType}
            onChange={(e) => setDraft({ ...draft, entryType: e.target.value })}
            className="ledger-input"
          >
            <option value="">All</option>
            {LEDGER_ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From" htmlFor="ledger-from">
          <input
            id="ledger-from"
            type="datetime-local"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="ledger-input"
          />
        </Field>
        <Field label="To" htmlFor="ledger-to">
          <input
            id="ledger-to"
            type="datetime-local"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="ledger-input"
          />
        </Field>
        <Field label="Search (id / stream / reservation)" htmlFor="ledger-search">
          <input
            id="ledger-search"
            type="text"
            value={draft.search}
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            maxLength={64}
            className="ledger-input"
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-1">
          <GlassIconButton
            type="button"
            variant="ghost"
            label="Reset filters"
            onClick={onReset}
          >
            <XMark />
          </GlassIconButton>
          <GlassIconButton
            type="submit"
            variant="accent"
            label="Apply filter"
          >
            <Funnel />
          </GlassIconButton>
          <GlassIconButton
            type="button"
            variant="success"
            label="Export CSV"
            disabled={exporting}
            onClick={onExport}
          >
            <Download />
          </GlassIconButton>
        </div>
      </form>

      {exportNotice && (
        <div
          role="status"
          className="text-sm px-4 py-3 rounded-xl bg-surface-container-low/60
            border border-white/[0.05] text-on-surface"
        >
          {exportNotice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="text-sm px-4 py-3 rounded-xl bg-feedback-error/10
            border border-feedback-error/40 text-feedback-error"
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.03] bg-surface-container-low/40 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">
            <tr>
              <th className="text-left p-3">Created at</th>
              <th className="text-left p-3">Workspace</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Entry type</th>
              <th className="text-right p-3">Δ Minutes</th>
              <th className="text-right p-3">Amount (paise)</th>
              <th className="text-left p-3">Stream</th>
              <th className="text-left p-3">Reference</th>
              <th className="text-left p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.04]">
                <td className="p-3 text-text-secondary whitespace-nowrap">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="p-3 font-mono text-xs">{r.workspace}</td>
                <td className="p-3 font-mono text-xs" title={r.created_by ?? ""}>
                  {shortId(r.created_by)}
                </td>
                <td className="p-3">{r.type}</td>
                <td className="p-3 text-right font-mono">{r.minutes_delta}</td>
                <td className="p-3 text-right font-mono">{r.amount}</td>
                <td className="p-3 font-mono text-xs" title={r.stream_id ?? ""}>
                  {shortId(r.stream_id)}
                </td>
                <td className="p-3 font-mono text-xs">
                  {shortId(r.reservation_id ?? r.purchase_id)}
                </td>
                <td className="p-3 font-mono text-xs text-text-secondary">
                  {r.idempotency_key ?? "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-text-secondary">
                  No ledger entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          {loading
            ? "Loading…"
            : `${rows.length} row${rows.length === 1 ? "" : "s"} loaded`}
        </span>
        {nextCursor && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-surface-container-low/60
              border border-white/[0.05] text-on-surface hover:border-primary/40
              disabled:opacity-50"
          >
            Load more
          </button>
        )}
      </div>

      <style>{`
        .ledger-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.75rem;
          color: inherit;
          font: inherit;
        }
        .ledger-input:focus {
          outline: 2px solid var(--color-primary);
          outline-offset: 1px;
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

export default LedgerExplorer;
