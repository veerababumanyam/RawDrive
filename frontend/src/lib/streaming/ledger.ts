import { getApiBaseUrl } from "@/lib/api/base-url";
// M35/35-7 — Super-admin streaming ledger explorer client.
//
// Mirrors backend/internal/streaming/handlers/admin_ledger_handler.go +
// internal/streaming/ledger filter contract.

const API_BASE = getApiBaseUrl();

export type LedgerEntryType =
  | "debit_reservation"
  | "credit_topup"
  | "refund"
  | "adjustment"
  | "fee";

export const LEDGER_ENTRY_TYPES: LedgerEntryType[] = [
  "debit_reservation",
  "credit_topup",
  "refund",
  "adjustment",
  "fee",
];

export interface LedgerRow {
  id: string;
  workspace: string;
  type: LedgerEntryType | string;
  amount: number;
  minutes_delta: number;
  purchase_id: string | null;
  reservation_id: string | null;
  stream_id: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LedgerFilters {
  workspace?: string;
  actor?: string;
  entryTypes?: string[];
  from?: string; // ISO-8601 (or datetime-local)
  to?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface LedgerPage {
  rows: LedgerRow[];
  next_cursor?: string;
}

function buildQuery(f: LedgerFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.workspace) q.set("workspace", f.workspace);
  if (f.actor) q.set("actor", f.actor);
  if (f.entryTypes && f.entryTypes.length > 0) {
    for (const t of f.entryTypes) q.append("entry_type", t);
  }
  if (f.from) q.set("from", new Date(f.from).toISOString());
  if (f.to) q.set("to", new Date(f.to).toISOString());
  if (f.search) q.set("search", f.search);
  if (f.cursor) q.set("cursor", f.cursor);
  if (f.limit) q.set("limit", String(f.limit));
  return q;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body?.message) msg = body.message;
      else if (body?.error) msg = body.error;
    } catch {
      // not json
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function fetchLedger(
  token: string,
  filters: LedgerFilters,
): Promise<LedgerPage> {
  const q = buildQuery(filters);
  const url = `${API_BASE}/api/v1/admin/streaming/ledger${q.toString() ? `?${q}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<LedgerPage>(res);
}

export interface CSVExportResult {
  truncated: boolean;
  filename: string;
}

/**
 * Streams CSV via fetch (so we can inspect X-Truncated) and triggers a
 * download via a blob URL. Returns whether the export was truncated.
 */
export async function exportLedgerCSV(
  token: string,
  filters: LedgerFilters,
): Promise<CSVExportResult> {
  const q = buildQuery(filters);
  const url = `${API_BASE}/api/v1/admin/streaming/ledger.csv${q.toString() ? `?${q}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`CSV export failed: ${res.status} ${res.statusText}`);
  }
  const truncated = res.headers.get("X-Truncated") === "true";
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `streaming_ledger_${Date.now()}.csv`;
  const blob = await res.blob();

  if (typeof window !== "undefined" && typeof URL.createObjectURL === "function") {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  return { truncated, filename };
}
