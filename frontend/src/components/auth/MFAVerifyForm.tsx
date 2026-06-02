"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getPostLoginPath, persistAuthTokens } from "@/lib/auth";

// F-007 (M17 wave 3): TOTP step-up form.
//
// Password login stores the mfa_token in sessionStorage; OAuth step-up uses
// an HttpOnly cookie set by the backend callback. The form posts whichever
// browser-readable token exists plus the current 6-digit code to
// /auth/verify-totp, then redirects to the post-login path.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const MFA_TOKEN_KEY = "rawdrive_mfa_token";
const MFA_FLOW_KEY = "rawdrive_mfa_flow";
const MFA_NETWORK_ERROR =
  "RawDrive couldn't be reached. Check your connection and try again.";

export function MFAVerifyForm() {
  const router = useRouter();
  // mfaToken === "" means OAuth-MFA flow: token lives in the HttpOnly
  // mfa_token cookie set by the OAuth callback (PR #57 / S5-G2) and is
  // read server-side in /auth/verify-totp. mfaToken === null means
  // we haven't decided yet (initial mount); a real string means the
  // password-then-MFA path stashed the JWT in sessionStorage.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(MFA_TOKEN_KEY);
    if (stored) {
      // Password-then-MFA path: the short-lived mfa_token JWT was stashed in
      // sessionStorage by handleLogin and is sent in the request body.
      setMfaToken(stored);
      return;
    }
    // OAuth-MFA (PR #57 / S5-G2) and any cookie-backed challenge: the real
    // mfa_token lives in the HttpOnly mfa_token cookie that the browser replays
    // on POST /auth/verify-totp, so it is NOT readable here. An empty string
    // signals "ready to verify with the cookie; send the code only". We do not
    // bounce to /login on a missing JS-visible marker because the HttpOnly
    // cookie may still be valid — the server is the authority and rejects with
    // "mfa_token and code required" if no challenge is actually in flight.
    setMfaToken("");
  }, [router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (mfaToken === null || code.trim().length < 6) {
      return;
    }
    setLoading(true);
    setError("");

    try {
      const body: { code: string; mfa_token?: string } = { code: code.trim() };
      if (mfaToken) {
        body.mfa_token = mfaToken;
      }
      const response = await fetch(`${API_BASE}/auth/verify-totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const mfaSessionExpired =
          payload.error === "invalid mfa token" ||
          payload.error === "mfa_token and code required";
        setError(
          payload.error === "invalid code"
            ? "That code did not match. Check your authenticator and try again."
            : mfaSessionExpired
              ? "Your sign-in session expired. Please start over."
              : "Verification failed. Please try again.",
        );
        if (mfaSessionExpired) {
          window.sessionStorage.removeItem(MFA_TOKEN_KEY);
          setTimeout(() => router.replace("/login"), 1500);
        }
        return;
      }

      // Clear the short-lived challenge before persisting the real tokens.
      window.sessionStorage.removeItem(MFA_TOKEN_KEY);
      window.sessionStorage.removeItem(MFA_FLOW_KEY);
      persistAuthTokens(payload.access_token);
      router.replace(getPostLoginPath());
    } catch {
      setError(MFA_NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(MFA_TOKEN_KEY);
      window.sessionStorage.removeItem(MFA_FLOW_KEY);
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
          disabled={loading || code.length < 6 || mfaToken === null}
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
