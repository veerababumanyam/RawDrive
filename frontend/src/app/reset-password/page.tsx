"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api/auth";

// M39 E6-S2: reset-password page. Consumes OTP + new password, calls
// /auth/reset-password. On success redirects to /login.

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [otp, setOTP] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prefilled = search?.get("email");
    if (prefilled) setEmail(prefilled);
  }, [search]);

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
      <div className="w-full max-w-md rounded-lg bg-surface-container p-8 shadow-lg border border-border-subtle">
        <h1 className="text-2xl font-semibold mb-2">Reset your password</h1>
        <p className="text-sm text-text-secondary mb-6">
          Enter the code we sent to your email and choose a new password.
        </p>

        <form onSubmit={onSubmit}>
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
            <span className="block text-sm text-text-secondary mb-1">Reset code</span>
            <input
              type="text"
              required
              inputMode="numeric"
              minLength={4}
              value={otp}
              onChange={(e) => setOTP(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 tracking-widest"
            />
          </label>
          <label className="block mb-3">
            <span className="block text-sm text-text-secondary mb-1">New password</span>
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
            />
          </label>
          <label className="block mb-4">
            <span className="block text-sm text-text-secondary mb-1">Confirm password</span>
            <input
              type="password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-feedback-error text-sm mb-3">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md px-4 py-2 bg-accent text-on-accent disabled:opacity-50"
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
