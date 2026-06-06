// Design source: Stitch MCP Liquid Glass — glass-card, status badges
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listDealers,
  approveDealer,
  rejectDealer,
  suspendDealer,
  enableDealer,
  getAdminDealerStateReports,
  type AdminDealerStateReportsResponse,
  type Dealer,
} from "@/lib/api/dealer";
import { getStoredAccessToken } from "@/lib/auth";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Trash, CheckCircle, XCircle } from "@/components/icons";
import DealerDeleteConfirmDialog from "@/components/admin/DealerDeleteConfirmDialog";

// Public GET /api/v1/states returns a sorted list of Indian states, already
// used by RegisterForm. We fetch it once and build an id→name map so the
// dealer card can render "Maharashtra" instead of the cosmetic "State: #14"
// that showed up during the 2026-04-12 UAT.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const DEFAULT_REPORT_COMMISSION_RATE = 20;

type ReviewMode = "applications" | "reports";

const statusColors: Record<string, string> = {
  pending: "bg-feedback-warning/10 text-feedback-warning",
  approved: "bg-accent-secondary/10 text-accent-secondary",
  rejected: "bg-feedback-error/10 text-feedback-error",
  suspended: "bg-feedback-error/10 text-feedback-error",
  terminated: "bg-text-tertiary/10 text-text-tertiary",
};

const formatPaisa = (paisa: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paisa / 100);

export default function DealerAdminReview() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReviewMode>("applications");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState(
    DEFAULT_REPORT_COMMISSION_RATE,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [stateNames, setStateNames] = useState<Record<number, string>>({});
  const [reports, setReports] =
    useState<AdminDealerStateReportsResponse | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const invalidateReports = () => setReports(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    listDealers(token)
      .then(setDealers)
      .catch(() => setDealers([]))
      .finally(() => setLoading(false));

    // Build the id→name lookup in parallel. Failing to load the map is
    // non-fatal — we fall back to rendering the numeric id on the card.
    fetch(`${API_BASE}/api/v1/states`)
      .then((res) => (res.ok ? res.json() : { states: [] }))
      .then((body: { states?: { id: number; name: string }[] }) => {
        const map: Record<number, string> = {};
        for (const s of body.states ?? []) map[s.id] = s.name;
        setStateNames(map);
      })
      .catch(() => {
        /* keep empty map — card falls back to the raw id */
      });
  }, []);

  const loadReports = useCallback(async () => {
    const token = getStoredAccessToken();
    setReportsLoading(true);
    setReportsError(null);
    try {
      const body = await getAdminDealerStateReports(token, {
        commission_rate_pct: DEFAULT_REPORT_COMMISSION_RATE,
      });
      setReports(body);
    } catch (err) {
      console.error("Dealer reports failed:", err);
      setReportsError("Failed to load dealer reports.");
      setReports(null);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const handleModeChange = (nextMode: ReviewMode) => {
    setMode(nextMode);
    if (nextMode === "reports" && !reports && !reportsLoading) {
      void loadReports();
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      const approved = await approveDealer(token, id, commissionRate);
      setDealers((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: "approved" as const,
                commission_rate_pct:
                  approved.commission_rate_pct ?? commissionRate,
              }
            : d,
        ),
      );
      setSelectedId(null);
      invalidateReports();
    } catch (err) {
      console.error("Approve failed:", err);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason) return;
    try {
      const token = getStoredAccessToken();
      await rejectDealer(token, id, rejectReason);
      setDealers((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: "pending" as const } : d,
        ),
      );
      setSelectedId(null);
      setRejectReason("");
      invalidateReports();
    } catch (err) {
      console.error("Reject failed:", err);
    }
  };

  // QA #49: inline suspend action for approved dealers. Uses window.prompt
  // for the reason (the backend requires a non-empty reason).
  const handleSuspend = async (id: string) => {
    const reason = window.prompt("Suspension reason:")?.trim();
    if (!reason) return;
    try {
      const token = getStoredAccessToken();
      await suspendDealer(token, id, reason);
      setDealers((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: "suspended" as const } : d,
        ),
      );
      invalidateReports();
    } catch (err) {
      console.error("Suspend failed:", err);
    }
  };

  const handleEnable = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await enableDealer(token, id);
      setDealers((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: "approved" as const } : d,
        ),
      );
      invalidateReports();
    } catch (err) {
      console.error("Enable failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-surface-sunken rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            {mode === "applications" ? "Dealer Applications" : "Dealer Reports"}
          </h2>
          <p className="mt-1 text-sm text-text-tertiary">
            {mode === "applications"
              ? "Review applications and approve dealer commission."
              : "Statewide subscription reports use a 20% default commission when a dealer has no saved rate."}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <div className="inline-flex min-h-[44px] rounded-full border border-border-subtle bg-surface-container-low p-1">
            {(["applications", "reports"] as ReviewMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleModeChange(item)}
                className={`min-h-[36px] rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  mode === item
                    ? "bg-surface-container-high text-text-primary shadow-glass"
                    : "text-text-tertiary hover:bg-surface-container-high hover:text-text-primary"
                }`}
              >
                {item === "applications" ? "Applications" : "Reports"}
              </button>
            ))}
          </div>
          {/* QA #47: point admins to the dealer onboarding flow. New dealers
              self-register via /dealer/register; admin workflow is
              approve/reject/suspend from here. */}
          <a
            href="/dealer/register"
            className="text-sm text-accent-secondary hover:underline"
          >
            Dealer onboarding flow →
          </a>
        </div>
      </div>

      {mode === "applications" ? (
        <>
          {dealers.map((dealer) => (
            <div key={dealer.id} className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-text-primary">
                    {dealer.business_name}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    PAN: {dealer.pan_number} | State:{" "}
                    {stateNames[dealer.state_id] ?? `#${dealer.state_id}`}
                  </p>
                  {dealer.commission_rate_pct !== null &&
                    dealer.commission_rate_pct !== undefined && (
                      <p className="text-sm text-text-secondary mt-0.5">
                        Commission Rate:{" "}
                        <span className="font-semibold text-accent">
                          {dealer.commission_rate_pct}%
                        </span>
                      </p>
                    )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[dealer.status]}`}
                >
                  {dealer.status}
                </span>
              </div>

              {dealer.status === "pending" && (
                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      setSelectedId(selectedId === dealer.id ? null : dealer.id)
                    }
                    className="btn-primary px-4 min-h-[44px] rounded-full text-sm"
                  >
                    Review
                  </button>
                </div>
              )}

              {/* Approved: show Disable toggle */}
              {dealer.status === "approved" && (
                <div className="flex items-center gap-2">
                  <GlassIconButton
                    variant="danger"
                    label="Disable dealer"
                    onClick={() => handleSuspend(dealer.id)}
                  >
                    <XCircle />
                  </GlassIconButton>
                  <span className="text-sm text-text-tertiary">Disable</span>
                </div>
              )}

              {/* Suspended: show Enable toggle + Delete action */}
              {dealer.status === "suspended" && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <GlassIconButton
                      variant="success"
                      label="Enable dealer"
                      onClick={() => handleEnable(dealer.id)}
                    >
                      <CheckCircle />
                    </GlassIconButton>
                    <span className="text-sm text-text-tertiary">Enable</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GlassIconButton
                      variant="danger"
                      label="Delete dealer"
                      onClick={() =>
                        setDeleteTarget({
                          id: dealer.id,
                          name: dealer.business_name,
                        })
                      }
                    >
                      <Trash />
                    </GlassIconButton>
                    <span className="text-sm text-text-tertiary">Delete</span>
                  </div>
                </div>
              )}

              {selectedId === dealer.id && (
                <div className="glass-card p-4 space-y-4 bg-surface-container">
                  <div>
                    <label
                      htmlFor={`commission-rate-${dealer.id}`}
                      className="text-sm text-text-secondary block mb-1"
                    >
                      Commission Rate (%)
                    </label>
                    <input
                      id={`commission-rate-${dealer.id}`}
                      type="number"
                      value={commissionRate}
                      onChange={(e) =>
                        setCommissionRate(Number(e.target.value))
                      }
                      min={1}
                      max={50}
                      className="input-base w-32 min-h-[44px]"
                    />
                  </div>
                  {/* QA #48: replaced window.prompt with an inline textarea so
                  admins can review + edit the rejection reason before
                  submitting. prompt() was a non-styled native modal that
                  broke the glass-card aesthetic and didn't allow multiline. */}
                  <div>
                    <label
                      htmlFor={`reject-reason-${dealer.id}`}
                      className="text-sm text-text-secondary block mb-1"
                    >
                      Rejection reason (required for reject)
                    </label>
                    <textarea
                      id={`reject-reason-${dealer.id}`}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="e.g., PAN verification failed, duplicate territory, etc."
                      className="input-base w-full text-sm"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(dealer.id)}
                      className="bg-accent-secondary/20 text-accent-secondary px-4 py-2 rounded-full min-h-[44px] text-sm font-medium hover:bg-accent-secondary/30 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(dealer.id)}
                      disabled={!rejectReason.trim()}
                      className="bg-feedback-error/20 text-feedback-error px-4 py-2 rounded-full min-h-[44px] text-sm font-medium hover:bg-feedback-error/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {dealers.length === 0 && (
            <div className="glass-card p-8 text-center text-text-secondary">
              No dealer applications found.
            </div>
          )}
        </>
      ) : (
        <DealerReportsView
          reports={reports}
          loading={reportsLoading}
          error={reportsError}
          onRefresh={loadReports}
        />
      )}

      {deleteTarget && (
        <DealerDeleteConfirmDialog
          open={!!deleteTarget}
          dealerId={deleteTarget.id}
          dealerName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDealers((prev) => prev.filter((d) => d.id !== deleteTarget!.id));
            invalidateReports();
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function DealerReportsView({
  reports,
  loading,
  error,
  onRefresh,
}: {
  reports: AdminDealerStateReportsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="space-y-4" aria-label="Loading dealer reports">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-surface-sunken"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-surface-sunken" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-feedback-error">{error}</p>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="btn-primary mt-4 min-h-[44px] px-4 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!reports) {
    return null;
  }

  const rows = reports.reports ?? [];
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(reports.year, reports.month - 1, 1)));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-card p-5">
          <p className="text-sm text-text-tertiary">Report month</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {monthLabel}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-sm text-text-tertiary">Statewide revenue</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {formatPaisa(reports.total_subscription_paisa)}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-sm text-text-tertiary">Projected dealer share</p>
          <p className="mt-2 text-2xl font-semibold text-accent-secondary">
            {formatPaisa(reports.total_projected_dealer_share_paisa)}
          </p>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border-subtle p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Statewide dealer report
            </h3>
            <p className="text-sm text-text-tertiary">
              Default commission: {reports.default_commission_rate_pct}%
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="min-h-[44px] rounded-full bg-surface-container-high px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            No dealer report rows found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-container-low text-xs uppercase text-text-tertiary">
                <tr>
                  <th className="px-5 py-3 font-semibold">State</th>
                  <th className="px-5 py-3 font-semibold">Dealer</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Commission</th>
                  <th className="px-5 py-3 font-semibold">Subscribers</th>
                  <th className="px-5 py-3 font-semibold">Revenue</th>
                  <th className="px-5 py-3 font-semibold">Dealer share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row) => (
                  <tr key={row.dealer_id} className="text-text-secondary">
                    <td className="px-5 py-4 font-medium text-text-primary">
                      {row.state_name}
                    </td>
                    <td className="px-5 py-4">{row.business_name}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[row.status] ?? statusColors.pending}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">{row.commission_rate_pct}%</td>
                    <td className="px-5 py-4">
                      {row.subscriber_count.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4">
                      {formatPaisa(row.total_subscription_paisa)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-accent-secondary">
                      {formatPaisa(row.dealer_share_paisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
