// Design source: Stitch MCP Liquid Glass — glass-card, status badges
"use client";

import { useState, useEffect } from "react";
import { listDealers, approveDealer, rejectDealer, suspendDealer, enableDealer, type Dealer } from "@/lib/api/dealer";
import { getStoredAccessToken } from "@/lib/auth";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Trash, CheckCircle, XCircle } from "@/components/icons";
import DealerDeleteConfirmDialog from "@/components/admin/DealerDeleteConfirmDialog";

// Public GET /api/v1/states returns a sorted list of Indian states, already
// used by RegisterForm. We fetch it once and build an id→name map so the
// dealer card can render "Maharashtra" instead of the cosmetic "State: #14"
// that showed up during the 2026-04-12 UAT.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusColors: Record<string, string> = {
  pending: "bg-feedback-warning/10 text-feedback-warning",
  approved: "bg-accent-secondary/10 text-accent-secondary",
  suspended: "bg-feedback-error/10 text-feedback-error",
  terminated: "bg-text-tertiary/10 text-text-tertiary",
};

export default function DealerAdminReview() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState(15);
  const [rejectReason, setRejectReason] = useState("");
  const [stateNames, setStateNames] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const handleApprove = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await approveDealer(token, id, commissionRate);
      setDealers((prev) => prev.map((d) => (d.id === id ? { ...d, status: "approved" as const } : d)));
      setSelectedId(null);
    } catch (err) {
      console.error("Approve failed:", err);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason) return;
    try {
      const token = getStoredAccessToken();
      await rejectDealer(token, id, rejectReason);
      setDealers((prev) => prev.map((d) => (d.id === id ? { ...d, status: "pending" as const } : d)));
      setSelectedId(null);
      setRejectReason("");
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
      setDealers((prev) => prev.map((d) => (d.id === id ? { ...d, status: "suspended" as const } : d)));
    } catch (err) {
      console.error("Suspend failed:", err);
    }
  };

  const handleEnable = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await enableDealer(token, id);
      setDealers((prev) => prev.map((d) => (d.id === id ? { ...d, status: "approved" as const } : d)));
    } catch (err) {
      console.error("Enable failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-surface-sunken rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Dealer Applications</h2>
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

      {dealers.map((dealer) => (
        <div key={dealer.id} className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-text-primary">{dealer.business_name}</h3>
              <p className="text-sm text-text-secondary">
                PAN: {dealer.pan_number} | State: {stateNames[dealer.state_id] ?? `#${dealer.state_id}`}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[dealer.status]}`}>
              {dealer.status}
            </span>
          </div>

          {dealer.status === "pending" && (
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedId(selectedId === dealer.id ? null : dealer.id)}
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
                  onClick={() => setDeleteTarget({ id: dealer.id, name: dealer.business_name })}
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
                <label className="text-sm text-text-secondary block mb-1">Commission Rate (%)</label>
                <input
                  type="number"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(Number(e.target.value))}
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
                <label className="text-sm text-text-secondary block mb-1">
                  Rejection reason (required for reject)
                </label>
                <textarea
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

      {deleteTarget && (
        <DealerDeleteConfirmDialog
          open={!!deleteTarget}
          dealerId={deleteTarget.id}
          dealerName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDealers((prev) => prev.filter((d) => d.id !== deleteTarget!.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
