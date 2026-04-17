"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api/auth";

// M39 E6-S2: forgot-password page. Accepts an email, calls
// /auth/request-password-reset which always returns 202 (enumeration
// defense), and redirects to /reset-password with the email prefilled.

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
      // Give users a moment to see the confirmation before redirecting.
      setTimeout(() => {
        const q = new URLSearchParams({ email });
        router.push(`/reset-password?${q.toString()}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg bg-surface-container p-8 shadow-lg border border-border-subtle">
        <h1 className="text-2xl font-semibold mb-2">Forgot your password?</h1>
        <p className="text-sm text-text-secondary mb-6">
          Enter the email on file. If it matches an account we&apos;ll send a reset code.
        </p>

        {submitted ? (
          <div role="status" className="text-feedback-success">
            If this email is registered, you&apos;ll receive a code shortly. Redirecting…
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="block mb-4">
              <span className="block text-sm text-text-secondary mb-1">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {busy ? "Sending…" : "Send reset code"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
