"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendOTP() {
    if (!identifier.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier }),
      });
      if (res.status === 409) {
        // User exists — that's fine for login, still send OTP
      }
      // OTP is generated regardless (register generates it)
      // For existing users, we'd need a separate /auth/login endpoint
      // For now, register + verify flow works for both
      if (!res.ok && res.status !== 409) {
        const data = await res.json();
        setError(data.error || "Failed to send OTP");
        return;
      }
      setOtpSent(true);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (!otpCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, code: otpCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Verification failed");
        return;
      }
      const { access_token, refresh_token } = await res.json();
      localStorage.setItem("rawdrive_token", access_token);
      localStorage.setItem("rawdrive_refresh_token", refresh_token);
      // Redirect to dashboard
      window.location.href = "/galleries";
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <div className="rounded-lg bg-error/10 border border-error/20 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {!otpSent ? (
        <>
          <div>
            <label htmlFor="login-identifier" className="block text-sm font-medium text-text-primary">
              Email or Phone Number
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                {identifier.includes("@") ? (
                  <Mail className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                ) : (
                  <Phone className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                )}
              </div>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                placeholder="you@example.com or +91 98765 43210"
                className="w-full rounded-md border border-border bg-surface-sunken py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary"
                style={{ height: "var(--touch-target-min)" }}
                autoComplete="email tel"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendOTP}
            disabled={loading || !identifier.trim()}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-50"
            style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="otp-code" className="block text-sm font-medium text-text-primary">
              Enter OTP sent to {identifier}
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
              placeholder="123456"
              className="mt-1 w-full rounded-md border border-border bg-surface-sunken py-2 px-3 text-center text-2xl tracking-[0.5em] text-text-primary"
              style={{ height: "var(--touch-target-min)" }}
              autoFocus
            />
            <p className="mt-2 text-xs text-text-tertiary">
              Check your terminal — OTP is printed to server logs in dev mode.
            </p>
          </div>

          <button
            type="button"
            onClick={handleVerifyOTP}
            disabled={loading || otpCode.length < 6}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-50"
            style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
          >
            {loading ? "Verifying..." : "Verify & Login"}
          </button>

          <button
            type="button"
            onClick={() => { setOtpSent(false); setOtpCode(""); setError(""); }}
            className="w-full text-sm text-text-secondary hover:text-text-primary"
          >
            Use a different email
          </button>
        </>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface-elevated px-2 text-text-tertiary">or continue with</span>
        </div>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-accent-subtle"
        style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>

      <p className="text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
          Register
        </Link>
      </p>
    </div>
  );
}
