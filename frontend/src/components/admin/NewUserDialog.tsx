"use client";

import { useEffect, useState } from "react";
import { createUser, listAdminPlans, type AdminPlan } from "@/lib/api/admin";
import { getStoredAccessToken } from "@/lib/auth";

// M39 E5-S2: admin "New user" modal. Exposes password-path and invite-path
// flows, rejects superadmin role at the UI by not offering it, and surfaces
// backend errors (invalid email, duplicate, weak password) inline.
//
// 2026-05-19 — plan-grant flow added. When the admin picks role=photographer
// they can optionally select a plan from a dropdown sourced dynamically from
// GET /api/v1/admin/plans. Selecting a plan (anything other than the empty
// "no grant" option) writes users.pending_plan_tier on the new user, which
// the onboarding service applies as the workspace's plan_tier at
// workspace-creation time — no payment required.

type Role = "admin" | "photographer" | "dealer" | "team_member" | "client";

interface NewUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const ALLOWED_ROLES: Role[] = [
  "admin",
  "photographer",
  "dealer",
  "team_member",
  "client",
];

// Empty string sentinel == "no plan grant"; the user picks their plan in
// the onboarding wizard like a self-serve signup. Anything else is a tier
// slug the backend will validate against the canonical subscription tier list.
const NO_GRANT_VALUE = "";

// Formats paise to a human-readable ₹ string for the dropdown options
// (e.g. 29900 → "₹299"). Avoids Intl.NumberFormat for the trivial case
// because rounding paise to rupees here is a one-liner.
function formatPaiseAsInr(paise: number): string {
  if (paise <= 0) return "Free";
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString("en-IN")}/mo`;
}

export default function NewUserDialog({
  open,
  onClose,
  onCreated,
}: NewUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("photographer");
  const [sendInvite, setSendInvite] = useState(true);
  const [initialPassword, setInitialPassword] = useState("");
  const [planTier, setPlanTier] = useState<string>(NO_GRANT_VALUE);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the plan catalog once the dialog opens. Fetching on open
  // (rather than on mount of the parent page) keeps the request out
  // of the User Management page's critical path — non-admin viewers
  // never trigger it, and the response is small enough that a fetch
  // per dialog-open is cheap. plansError surfaces as an inline note;
  // the form still submits successfully without a plan grant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const token = getStoredAccessToken() || "";
    listAdminPlans(token)
      .then((data) => {
        if (cancelled) return;
        setPlans(
          data.filter(
            (plan) =>
              plan.tier !== "pay_per_event" &&
              plan.active &&
              (plan.self_serve || plan.tier === "elite_studio"),
          ),
        );
        setPlansError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPlansError(
          err instanceof Error ? err.message : "Failed to load plans",
        );
        setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset the plan selection whenever the role changes away from
  // photographer — the backend rejects plan grants for non-photographer
  // roles with 400 invalid_plan_tier, so clearing here avoids a
  // confusing inline error on submit when the admin flips the role.
  // Using the "store-derived-value" pattern (setState during render)
  // to avoid a synchronous setState inside an effect.
  const [prevRole, setPrevRole] = useState<Role>(role);
  if (role !== prevRole) {
    setPrevRole(role);
    if (role !== "photographer") setPlanTier(NO_GRANT_VALUE);
  }

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
        ...(sendInvite
          ? { send_invite: true }
          : { initial_password: initialPassword }),
        // Send plan_tier only when (a) the role is photographer, AND
        // (b) the admin actually picked one. Sending an empty string
        // would just be ignored server-side, but omitting the field
        // keeps the request body clean and the audit log honest about
        // intent.
        ...(role === "photographer" && planTier !== NO_GRANT_VALUE
          ? { plan_tier: planTier }
          : {}),
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/40 glass-blur-subtle"
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
          <span className="block text-sm text-text-secondary mb-1">
            Full name
          </span>
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

        {/* Plan grant — photographer-only. Other roles don't own a
            workspace so a plan comp has no surface to apply against,
            mirroring the backend's invalid_plan_tier rejection. */}
        {role === "photographer" && (
          <label className="block mb-3">
            <span className="block text-sm text-text-secondary mb-1">
              Plan grant{" "}
              <span className="text-text-tertiary">(optional, 100% comp)</span>
            </span>
            <select
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value)}
              disabled={plans.length === 0 && !plansError}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 disabled:opacity-60"
            >
              <option value={NO_GRANT_VALUE}>
                No grant — user picks during onboarding
              </option>
              {plans.map((p) => (
                <option key={p.tier} value={p.tier}>
                  {p.name} — {formatPaiseAsInr(p.monthly_price_paise)} (free for
                  this user)
                </option>
              ))}
            </select>
            {plansError && (
              <p className="mt-1 text-xs text-feedback-error">
                Couldn&apos;t load plan list ({plansError}). The user can still
                be created without a plan grant — they&apos;ll pick a plan
                during onboarding.
              </p>
            )}
            {!plansError && planTier !== NO_GRANT_VALUE && (
              <p className="mt-1 text-xs text-text-tertiary">
                This user&apos;s workspace will be created on the selected plan
                automatically when they complete onboarding. No payment is
                collected.
              </p>
            )}
          </label>
        )}

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
