"use client";

import { useState } from "react";
import { createUser } from "@/lib/api/admin";
import { getStoredAccessToken } from "@/lib/auth";

// M39 E5-S2: admin "New user" modal. Exposes password-path and invite-path
// flows, rejects superadmin role at the UI by not offering it, and surfaces
// backend errors (invalid email, duplicate, weak password) inline.

type Role = "admin" | "photographer" | "dealer" | "user" | "customer";

interface NewUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const ALLOWED_ROLES: Role[] = ["admin", "photographer", "dealer", "user", "customer"];

export default function NewUserDialog({ open, onClose, onCreated }: NewUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("photographer");
  const [sendInvite, setSendInvite] = useState(true);
  const [initialPassword, setInitialPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = getStoredAccessToken() || "";
      await createUser(token, {
        email,
        full_name: fullName,
        role,
        ...(sendInvite ? { send_invite: true } : { initial_password: initialPassword }),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg bg-surface-container p-6 shadow-lg border border-border-subtle"
      >
        <h2 id="new-user-title" className="text-xl font-semibold mb-4">
          New User
        </h2>

        <label className="block mb-3">
          <span className="block text-sm text-text-secondary mb-1">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
          />
        </label>

        <label className="block mb-3">
          <span className="block text-sm text-text-secondary mb-1">Full name</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
          />
        </label>

        <label className="block mb-3">
          <span className="block text-sm text-text-secondary mb-1">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
          >
            {ALLOWED_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mb-3 border border-border-subtle rounded-md p-3">
          <legend className="text-sm text-text-secondary px-2">Access</legend>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="radio"
              name="path"
              checked={sendInvite}
              onChange={() => setSendInvite(true)}
            />
            <span>Send invite (OTP)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="path"
              checked={!sendInvite}
              onChange={() => setSendInvite(false)}
            />
            <span>Set initial password</span>
          </label>
          {!sendInvite && (
            <input
              type="password"
              placeholder="Initial password"
              minLength={12}
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              className="mt-2 w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
            />
          )}
        </fieldset>

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
            type="submit"
            className="rounded-md px-4 py-2 bg-accent text-on-accent disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}
