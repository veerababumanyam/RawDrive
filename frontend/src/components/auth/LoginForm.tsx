"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, RotateCcw } from "lucide-react";
import {
  getGoogleOAuthStartUrl,
  getPostLoginPath,
  persistAuthTokens,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function friendlyOAuthError(code: string | null) {
  if (!code) {
    return "";
  }

  switch (code) {
    case "oauth_failed":
      return "Google sign-in could not be completed. Please try again.";
    case "missing_state":
      return "The Google sign-in session expired. Please start again.";
    default:
      return "Authentication could not be completed. Please try again.";
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const registered = searchParams.get("registered") === "1";
  const oauthAccessToken = searchParams.get("access_token");
  const oauthRefreshToken = searchParams.get("refresh_token");
  const oauthError = searchParams.get("error");
  const prefilledEmail = searchParams.get("email") || "";

  const googleStartUrl = useMemo(() => getGoogleOAuthStartUrl(API_BASE), []);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  useEffect(() => {
    if (!oauthAccessToken || !oauthRefreshToken) {
      return;
    }

    persistAuthTokens(oauthAccessToken, oauthRefreshToken, true);
    router.replace(getPostLoginPath());
  }, [oauthAccessToken, oauthRefreshToken, router]);

  useEffect(() => {
    if (registered) {
      setNotice("Account created. We’ve prefilled your email so you can request your OTP.");
      return;
    }

    const oauthMessage = friendlyOAuthError(oauthError);
    if (oauthMessage) {
      setError(oauthMessage);
    }
  }, [oauthError, registered]);

  async function handleSendOtp() {
    if (!email.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          payload.error || "We could not send your OTP. Please check your email and try again.",
        );
        return;
      }

      setOtpSent(true);
      setNotice("OTP sent. In local development the code is printed in the backend logs.");
    } catch {
      setError("Network error. Please confirm the API server is running.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.trim().length < 6) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "OTP verification failed.");
        return;
      }

      persistAuthTokens(payload.access_token, payload.refresh_token, true);
      window.location.assign(getPostLoginPath());
    } catch {
      setError("Network error. Please confirm the API server is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-[#a3a6ff]/20 bg-[#a3a6ff]/10 px-4 py-3 text-sm text-[#d9c8ff]">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-[#ff6e84]/30 bg-[#a70138]/20 px-4 py-3 text-sm text-[#ffb2b9]">
          {error}
        </div>
      ) : null}

      {!otpSent ? (
        <>
          <div className="space-y-2">
            <label
              htmlFor="login-email"
              className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/55"
            >
              Email Address
            </label>
            <div className="group relative">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSendOtp();
                  }
                }}
                placeholder="name@photographer.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 pr-12 text-white placeholder:text-zinc-600 focus:border-[#a3a6ff] focus:outline-none focus:ring-2 focus:ring-[#a3a6ff]/40"
                autoComplete="email"
              />
              <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-600 transition-colors group-focus-within:text-[#a3a6ff]" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSendOtp()}
            disabled={loading || !email.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-[#a3a6ff] to-[#8455ef] py-4 font-headline text-base font-bold text-[#0f00a4] shadow-lg shadow-[#a3a6ff]/20 transition-all hover:opacity-90 hover:shadow-[#a3a6ff]/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <label
              htmlFor="otp-code"
              className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/55"
            >
              One-Time Password
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleVerifyOtp();
                }
              }}
              placeholder="123456"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center text-2xl tracking-[0.45em] text-white placeholder:text-zinc-600 focus:border-[#a3a6ff] focus:outline-none focus:ring-2 focus:ring-[#a3a6ff]/40"
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={loading || otpCode.length < 6}
            className="w-full rounded-xl bg-gradient-to-r from-[#a3a6ff] to-[#8455ef] py-4 font-headline text-base font-bold text-[#0f00a4] shadow-lg shadow-[#a3a6ff]/20 transition-all hover:opacity-90 hover:shadow-[#a3a6ff]/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOtpSent(false);
              setOtpCode("");
              setError("");
              setNotice("");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Use a different email
          </button>
        </>
      )}

      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-white/10" />
        <span className="mx-4 text-xs font-bold tracking-[0.24em] text-zinc-500">OR</span>
        <div className="flex-grow border-t border-white/10" />
      </div>

      <button
        type="button"
        onClick={() => window.location.assign(googleStartUrl)}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-4 font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span>Sign in with Google</span>
      </button>

      <div className="text-center">
        <p className="text-sm text-zinc-400">
          Don&apos;t have an account?
          <Link
            href="/register"
            className="ml-1 font-bold text-indigo-300 underline decoration-2 underline-offset-4 transition-colors hover:text-white"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
