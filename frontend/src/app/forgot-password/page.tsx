"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api/auth";

// M39 E6-S2: forgot-password page. Accepts an email and calls
// /auth/request-password-reset which always returns 202 (enumeration
// defense). 2026-05-19 UX rework: the previous version auto-redirected
// to /reset-password 1.2s after submit with a vague "you'll receive a
// code shortly" message, which was unhelpful because the email was
// never actually sent (notifier was nil). With the email send fixed
// in the backend we now show a clear "we sent a 6-digit code to
// <email>" confirmation card, name the inbox/spam folder, surface the
// 15-minute expiry, and let the user click through to the reset page
// when they're ready instead of being yanked there mid-thought. The
// "Resend code" link re-submits with a 30s cooldown so accidental
// double-taps don't trigger the per-IP rate limiter.
// Issue #4: when arrived from an admin invitation email the URL carries
// ?email= so we pre-fill the field to cut one click from the flow.

const RESEND_COOLDOWN_SECONDS = 30;
const OTP_EXPIRY_MINUTES = 15;

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get("email");
    if (param && !email) {
      setEmail(param);
    }
    // intentionally only react to searchParams — we do not want to
    // overwrite a value the user has typed if the query later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Resend countdown timer — drives the disabled state + label on the
  // "Resend code" button so the user sees concrete feedback ("Resend
  // in 27s") instead of a silently-disabled link.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const handle = window.setInterval(() => {
      setResendCooldown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [resendCooldown]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (resendCooldown > 0 || busy) return;
    setError(null);
    setResendNotice(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setResendNotice("New code sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg bg-surface-container p-8 shadow-lg border border-border-subtle">
        {submitted ? (
          <>
            <h1 className="text-2xl font-semibold mb-2">Check your inbox</h1>
            <p className="text-sm text-text-secondary mb-4">
              We sent a 6-digit code to <strong className="text-text-primary">{email}</strong>.
              Enter it on the next page to choose a new password.
            </p>
            <ul className="mb-6 space-y-1.5 text-xs text-text-secondary">
              <li>• The code expires in {OTP_EXPIRY_MINUTES} minutes.</li>
              <li>• Check your spam or promotions folder if you don&apos;t see it within a minute.</li>
              <li>• For your security, never share the code with anyone.</li>
            </ul>
            <button
              type="button"
              onClick={() => {
                const q = new URLSearchParams({ email });
                router.push(`/reset-password?${q.toString()}`);
              }}
              className="w-full rounded-md px-4 py-2 bg-accent text-on-accent"
            >
              Continue to reset password
            </button>
            <div className="mt-4 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onResend}
                disabled={resendCooldown > 0 || busy}
                className="text-accent hover:underline disabled:cursor-not-allowed disabled:text-text-tertiary disabled:no-underline"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : busy
                    ? "Resending…"
                    : "Didn't receive it? Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setResendNotice(null);
                }}
                className="text-text-tertiary hover:text-text-primary"
              >
                Use a different email
              </button>
            </div>
            {resendNotice && (
              <p className="mt-3 text-xs text-feedback-success" role="status">
                {resendNotice}
              </p>
            )}
            {error && (
              <p className="mt-3 text-xs text-feedback-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mb-2">Forgot your password?</h1>
            <p className="text-sm text-text-secondary mb-6">
              Enter the email on file. If it matches an account we&apos;ll send a 6-digit reset code.
            </p>
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
          </>
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

// Next 15 requires useSearchParams() to sit inside a Suspense boundary
// during static rendering; wrap the client form accordingly.
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
