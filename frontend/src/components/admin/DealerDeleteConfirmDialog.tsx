"use client";

import { useState } from "react";
import { deleteDealer } from "@/lib/api/admin";
import { getStoredAccessToken } from "@/lib/auth";

// M39 E7-S3: confirm dialog that soft-deletes a dealer via
// DELETE /api/v1/admin/dealers/{id}. Required because delete is
// destructive and we want an explicit opt-in step.

interface DealerDeleteConfirmDialogProps {
  open: boolean;
  dealerId: string;
  dealerName: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function DealerDeleteConfirmDialog({
  open,
  dealerId,
  dealerName,
  onClose,
  onDeleted,
}: DealerDeleteConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = getStoredAccessToken() || "";
      await deleteDealer(token, dealerId);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dealer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-lg bg-surface-container p-6 shadow-lg border border-border-subtle">
        <h2 id="delete-dealer-title" className="text-xl font-semibold mb-2">
          Delete dealer?
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          This will soft-delete <strong>{dealerName}</strong>. They will no longer appear in the
          admin list. Historical audit entries remain.
        </p>
        {error && (
          <p role="alert" className="text-feedback-error text-sm mb-3">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 border border-border-subtle hover:bg-surface-container-high"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md px-4 py-2 bg-feedback-error text-on-feedback-error disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
