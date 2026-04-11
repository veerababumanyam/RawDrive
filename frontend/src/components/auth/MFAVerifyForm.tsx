"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getPostLoginPath, persistAuthTokens } from "@/lib/auth";

// F-007 (M17 wave 3): TOTP step-up form.
//
// Reads the mfa_token from sessionStorage (set by LoginForm on 401 +
// mfa_required), posts it alongside the user's current 6-digit code to
// /auth/verify-totp, persists the returned access+refresh tokens, and
// redirects to the post-login path. On error, the user can retry or
// restart from /login.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const MFA_TOKEN_KEY = "rawdrive_mfa_token";

export function MFAVerifyForm() {
  const router = useRouter();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(MFA_TOKEN_KEY);
    if (!stored) {
      // No challenge in flight — send the user back to login.
      router.replace("/login");
      return;
    }
    setMfaToken(stored);
  }, [router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken || code.trim().length < 6) {
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/verify-totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfa_token: mfaToken, code: code.trim() }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          payload.error === "invalid code"
            ? "That code did not match. Check your authenticator and try again."
            : payload.error === "invalid mfa token"
              ? "Your sign-in session expired. Please start over."
              : "Verification failed. Please try again.",
        );
        if (payload.error === "invalid mfa token") {
          window.sessionStorage.removeItem(MFA_TOKEN_KEY);
          setTimeout(() => router.replace("/login"), 1500);
        }
        return;
      }

      // Clear the short-lived challenge before persisting the real tokens.
      window.sessionStorage.removeItem(MFA_TOKEN_KEY);
      persistAuthTokens(payload.access_token, payload.refresh_token, true);
      window.location.assign(getPostLoginPath());
    } catch {
      setError("Network error. Please confirm the API server is running.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(MFA_TOKEN_KEY);
    }
    router.replace("/login");
  }

  return (
    <div className="mt-10 space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={handleVerify} className="space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="mfa-code"
            className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary"
          >
            6-digit code
          </label>
          <div className="group relative">
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="input-base w-full pr-12 text-center font-mono text-2xl tracking-[0.5em]"
              required
              autoFocus
            />
            <KeyRound className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary transition-colors group-focus-within:text-accent" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || code.length < 6 || !mfaToken}
          className="btn-primary w-full py-4 font-headline text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Verifying..." : "Verify & Sign In"}
        </button>
      </form>

      <div className="text-center">
        <button
          type="button"
          onClick={handleCancel}
          className="text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Cancel and return to login
        </button>
      </div>
    </div>
  );
}
