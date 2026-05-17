"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, KeyRound, Copy, CheckCircle2, Lock } from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import { changePassword } from "@/lib/api/auth";

// F-007 (M17 wave 3): MFA enrollment UI.
//
// Three-step wizard:
//   1. Status — show current enrollment state + "Set up" CTA
//   2. Enroll — call POST /auth/mfa/enroll, show secret + otpauth URL,
//      user scans or types it into their authenticator, enters first code
//   3. Recovery — after verify-enrollment succeeds, show recovery codes
//      ONCE with an acknowledgement checkbox
//
// Manual secret entry is supported because wave 3 doesn't yet render an
// SVG QR code — users can paste the otpauth URL into apps that accept it
// or type the plaintext secret into apps that don't.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type WizardStep = "status" | "enroll" | "verify" | "recovery" | "done";

interface StatusResponse {
  enrolled: boolean;
  verified_enrolled: boolean;
  active_recovery_codes: number;
}

interface EnrollResponse {
  secret: string;
  otpauth_url: string;
  issuer: string;
}

interface VerifyEnrollmentResponse {
  recovery_codes: string[];
}

function authedFetch(path: string, init?: RequestInit) {
  const token = getStoredAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export default function SecuritySettingsPage() {
  const searchParams = useSearchParams();
  const changeRequired = searchParams.get("change_required") === "1";

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pwNew !== pwConfirm) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      const token = getStoredAccessToken();
      await changePassword(token ?? "", pwCurrent, pwNew);
      setPwDone(true);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      if (changeRequired) {
        window.location.assign("/dealer");
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setPwBusy(false);
    }
  }

  const [step, setStep] = useState<WizardStep>("status");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setError("");
    try {
      const res = await authedFetch("/auth/mfa/status");
      if (!res.ok) {
        setError("Could not load MFA status.");
        return;
      }
      const body = (await res.json()) as StatusResponse;
      setStatus(body);
    } catch {
      setError("Network error loading MFA status.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleStartEnrollment() {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/auth/mfa/enroll", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          setError(
            "MFA is not configured on this server. Ask your administrator to set PLATFORM_SETTINGS_KEK.",
          );
        } else if (res.status === 409) {
          setError("MFA is already enrolled. Remove the existing enrollment first.");
        } else {
          setError(body.error || "Could not start enrollment.");
        }
        return;
      }
      setEnrollment(body as EnrollResponse);
      setStep("verify");
    } catch {
      setError("Network error starting enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/auth/mfa/verify-enrollment", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.error === "invalid code"
            ? "That code did not match. Double-check your authenticator and try again."
            : body.error || "Verification failed.",
        );
        return;
      }
      setRecoveryCodes((body as VerifyEnrollmentResponse).recovery_codes);
      setStep("recovery");
      setCode("");
    } catch {
      setError("Network error verifying enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard copy failed. Please write these codes down manually.");
    }
  }

  async function handleFinishRecovery() {
    if (!acknowledged) return;
    setStep("done");
    setEnrollment(null);
    setRecoveryCodes([]);
    setAcknowledged(false);
    await loadStatus();
    setStep("status");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent shadow-glass">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-text-primary">
              Account Security
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Protect your account with two-factor authentication.
            </p>
          </div>
        </div>
      </header>

      {/* Change Password section — always visible, shown prominently when forced */}
      <section className="glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high text-text-secondary">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-headline text-xl font-bold text-text-primary">Change Password</h2>
            {changeRequired && (
              <p className="mt-0.5 text-sm text-feedback-warning font-medium">
                You must set a new password before continuing.
              </p>
            )}
          </div>
        </div>

        {pwDone ? (
          <div role="alert" className="rounded-2xl border border-feedback-success/20 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success">
            Password updated successfully.
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            {pwError && (
              <div role="alert" className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
                {pwError}
              </div>
            )}
            <div>
              <label htmlFor="pw-current" className="block text-sm font-medium text-text-secondary mb-1">
                Current Password *
              </label>
              <input
                id="pw-current"
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className="input-base w-full"
                placeholder="Your current password"
              />
            </div>
            <div>
              <label htmlFor="pw-new" className="block text-sm font-medium text-text-secondary mb-1">
                New Password *
              </label>
              <input
                id="pw-new"
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className="input-base w-full"
                placeholder="Min 12 chars, upper + lower + digit + special"
              />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="block text-sm font-medium text-text-secondary mb-1">
                Confirm New Password *
              </label>
              <input
                id="pw-confirm"
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="input-base w-full"
                placeholder="Repeat new password"
              />
            </div>
            <button
              type="submit"
              disabled={pwBusy}
              className="btn-primary px-6 py-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pwBusy ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {error}
        </div>
      ) : null}

      {step === "status" ? (
        <section className="glass-card p-8">
          <h2 className="font-headline text-xl font-bold text-text-primary">
            Two-factor authentication (TOTP)
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Add a second factor using an authenticator app such as 1Password, Authy, or Google
            Authenticator. After enrollment, every sign-in requires a fresh 6-digit code.
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-surface-container-low p-5">
            {statusLoading ? (
              <p className="text-sm text-text-tertiary">Loading status…</p>
            ) : status?.verified_enrolled ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-feedback-success" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">MFA is active</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    You have {status.active_recovery_codes} active recovery{" "}
                    {status.active_recovery_codes === 1 ? "code" : "codes"} remaining.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 text-text-tertiary" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    MFA is not yet set up
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Enroll an authenticator app to protect your account.
                  </p>
                </div>
              </div>
            )}
          </div>

          {!status?.verified_enrolled ? (
            <button
              type="button"
              onClick={handleStartEnrollment}
              disabled={busy || statusLoading}
              className="btn-primary mt-6 px-6 py-3 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Starting…" : "Set up two-factor auth"}
            </button>
          ) : null}
        </section>
      ) : null}

      {step === "verify" && enrollment ? (
        <section className="glass-card p-8">
          <h2 className="font-headline text-xl font-bold text-text-primary">
            Step 1 — Add to your authenticator
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Open your authenticator app and add a new entry using the secret below, then enter
            the current 6-digit code to confirm.
          </p>

          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
                Issuer
              </dt>
              <dd className="mt-1 font-mono text-sm text-text-primary">{enrollment.issuer}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
                Secret
              </dt>
              <dd className="mt-1 break-all rounded-xl border border-border bg-surface-container-low px-4 py-3 font-mono text-sm text-text-primary">
                {enrollment.secret}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
                otpauth URL (for apps that accept a link)
              </dt>
              <dd className="mt-1 break-all rounded-xl border border-border bg-surface-container-low px-4 py-3 font-mono text-xs text-text-secondary">
                {enrollment.otpauth_url}
              </dd>
            </div>
          </dl>

          <form onSubmit={handleVerifyEnrollment} className="mt-8 space-y-4">
            <label
              htmlFor="verify-code"
              className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary"
            >
              Current 6-digit code
            </label>
            <input
              id="verify-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="input-base w-full py-4 text-center font-mono text-2xl tracking-[0.5em]"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="btn-primary w-full py-4 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Activate MFA"}
            </button>
          </form>
        </section>
      ) : null}

      {step === "recovery" ? (
        <section className="glass-card p-8">
          <h2 className="font-headline text-xl font-bold text-text-primary">
            Step 2 — Save your recovery codes
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Store these codes in a password manager or print them. Each code works exactly{" "}
            <strong>once</strong> if you lose access to your authenticator. You will NOT see
            them again after leaving this page.
          </p>

          <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {recoveryCodes.map((rc) => (
              <li
                key={rc}
                className="rounded-xl border border-border bg-surface-container-low px-3 py-3 text-center font-mono text-sm text-text-primary"
              >
                {rc}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCopyRecoveryCodes}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-container-low px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-container-high"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-feedback-success" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy all codes
                </>
              )}
            </button>
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-secondary">
              I have saved my recovery codes in a safe place and understand I will not see them
              again.
            </span>
          </label>

          <button
            type="button"
            onClick={handleFinishRecovery}
            disabled={!acknowledged}
            className="btn-primary mt-6 w-full py-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Done
          </button>
        </section>
      ) : null}
    </div>
  );
}
