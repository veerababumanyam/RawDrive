"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api/auth";

// M39 E6-S2: reset-password page. Consumes OTP + new password, calls
// /auth/reset-password. On success redirects to /login.

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const emailParam = search?.get("email") ?? "";
  // Prefill from ?email= once on mount via lazy init — never overwrites a value
  // the user later types if the query changes (matches the previous effect's intent).
  const [email, setEmail] = useState(() => emailParam);
  const [otp, setOTP] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email, otp, password);
      router.push("/login?reset=ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg bg-surface-container p-8 shadow-glass border border-border-subtle">
        <h1 className="text-2xl font-semibold mb-2">Reset your password</h1>
        <p className="text-sm text-text-secondary mb-6">
          Enter the code we sent to your email and choose a new password.
        </p>

        <form onSubmit={onSubmit}>
          <label className="block mb-3">
            <span className="block text-sm text-text-secondary mb-1">
              Email
            </span>
            <input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
              className="input-base w-full"
            />
          </label>
          <label className="block mb-3">
            <span className="block text-sm text-text-secondary mb-1">
              Reset code
            </span>
            <input
              id="reset-otp"
              type="text"
              required
              inputMode="numeric"
              minLength={4}
              value={otp}
              onChange={(e) => setOTP(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
              className="input-base w-full tracking-widest"
            />
          </label>
          <label className="block mb-1">
            <span className="block text-sm text-text-secondary mb-1">
              New password
            </span>
            <input
              id="reset-password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                error ? "reset-password-hint reset-error" : "reset-password-hint"
              }
              className="input-base w-full"
            />
          </label>
          <p
            id="reset-password-hint"
            className="mb-3 mt-1 text-xs text-text-tertiary"
          >
            At least 12 characters.
          </p>
          <label className="block mb-4">
            <span className="block text-sm text-text-secondary mb-1">
              Confirm password
            </span>
            <input
              id="reset-confirm"
              type="password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
              className="input-base w-full"
            />
          </label>
          {error && (
            <p
              id="reset-error"
              role="alert"
              className="text-feedback-error text-sm mb-3"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
