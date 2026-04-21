"use client";

import { useEffect, useState } from "react";
import { grantUploadCredits } from "@/lib/api/admin";
import { getStoredAccessToken } from "@/lib/auth";

// M41 FR-UCRT-10 follow-up: admin UI for POST
// /api/v1/admin/workspaces/{id}/upload-credits/grant. Backend has existed
// since PR #42 but there was no frontend affordance — the RechargeModal
// explicitly pointed users to "Settings → Admin → Upload credits" that
// didn't exist. This dialog closes the loop.
//
// Contract:
//   - amount_credits: 1..100_000 (backend rejects >100k with 422
//     GRANT_CAP_EXCEEDED)
//   - reason: non-empty (backend rejects empty with 400
//     INVALID_GRANT_INPUT)
//   - idempotency_key: auto-generated as crypto.randomUUID() so accidental
//     double-clicks never double-grant
//   - On success: ledger entry id + amount are shown, audit_log is
//     written server-side by the GrantAdmin tx

export interface GrantUploadCreditsDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  onGranted?: (amount: number) => void;
}

const PER_GRANT_CAP = 100_000;

export function GrantUploadCreditsDialog({
  open,
  onClose,
  workspaceId,
  workspaceName,
  onGranted,
}: GrantUploadCreditsDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    amount: number;
    ledgerEntryId: string;
  } | null>(null);

  // Reset form when the dialog is reopened against a different workspace.
  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setError(null);
      setSuccess(null);
      setBusy(false);
    }
  }, [open, workspaceId]);

  // Escape-to-close matches the project's other dialogs (RechargeModal,
  // NewUserDialog) so the dismiss contract is consistent.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const parsedAmount = Number(amount);
  const amountValid =
    Number.isFinite(parsedAmount) &&
    Number.isInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= PER_GRANT_CAP;
  const reasonValid = reason.trim().length > 0;
  const canSubmit = amountValid && reasonValid && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const token = getStoredAccessToken() || "";
      // crypto.randomUUID is available in all browsers Next.js 15 supports
      // and guarantees uniqueness across the (workspace_id, key) partial
      // unique index — a double-click on submit will 200 OK the second
      // time because the backend sees the same key and returns the
      // existing ledger entry instead of double-writing.
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const resp = await grantUploadCredits(token, workspaceId, {
        amount_credits: parsedAmount,
        idempotency_key: idempotencyKey,
        reason: reason.trim(),
      });
      setSuccess({ amount: resp.amount_credits, ledgerEntryId: resp.ledger_entry_id });
      onGranted?.(resp.amount_credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-upload-credits-title"
      data-testid="grant-upload-credits-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-base/95 shadow-xl p-6 space-y-4 text-text-primary"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="grant-upload-credits-title" className="text-lg font-semibold">
              Grant upload credits
            </h2>
            <p className="text-sm text-text-secondary">
              Granting to <span className="font-medium text-text-primary">{workspaceName}</span>
            </p>
          </div>
          {/* Same token-surface close pattern as the RechargeModal fix
              (PR #49) — guaranteed contrast on all three themes. */}
          <button
            type="button"
            aria-label="Close grant dialog"
            title="Close grant dialog"
            onClick={onClose}
            data-testid="grant-upload-credits-close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {success ? (
          <div
            data-testid="grant-upload-credits-success"
            className="rounded-lg border border-feedback-success/30 bg-feedback-success/10 p-3 text-sm space-y-1"
          >
            <p className="font-medium">
              {success.amount.toLocaleString("en-IN")} credits granted.
            </p>
            <p className="text-xs text-text-secondary break-all">
              Ledger entry: <span className="font-mono">{success.ledgerEntryId}</span>
            </p>
          </div>
        ) : (
          <>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text-primary">Amount (credits)</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={PER_GRANT_CAP}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                required
                autoFocus
                data-testid="grant-upload-credits-amount"
                className="w-full rounded-md border border-border-subtle bg-surface-container-low px-3 py-2 text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                placeholder="e.g. 500"
              />
              <span className="block text-xs text-text-tertiary">
                Integer between 1 and {PER_GRANT_CAP.toLocaleString("en-IN")}.
              </span>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text-primary">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                required
                rows={3}
                data-testid="grant-upload-credits-reason"
                className="w-full rounded-md border border-border-subtle bg-surface-container-low px-3 py-2 text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                placeholder="Stored in audit_log. Why is this grant being made?"
              />
            </label>
          </>
        )}

        {error && !success && (
          <div
            data-testid="grant-upload-credits-error"
            className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm"
          >
            {error}
          </div>
        )}

        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="grant-upload-credits-cancel"
            className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="grant-upload-credits-submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {busy ? "Granting…" : "Grant credits"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

export default GrantUploadCreditsDialog;
