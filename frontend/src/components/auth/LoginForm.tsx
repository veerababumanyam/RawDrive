"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, KeyRound } from "lucide-react";
import {
  getGoogleOAuthStartUrl,
  getPostLoginPath,
  isAndroidWebView,
  openPageInChrome,
  persistAuthTokens,
  refreshAuthSession,
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
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [webviewNotice, setWebviewNotice] = useState(false);

  const registered = searchParams.get("registered") === "1";
  const oauthAuthenticated = searchParams.get("authenticated") === "1";
  const oauthMfaRequired = searchParams.get("mfa_required") === "1";
  const oauthMfaToken = searchParams.get("mfa_token") || "";
  const oauthError = searchParams.get("error");
  const prefilledEmail = searchParams.get("email") || "";

  const googleStartUrl = useMemo(() => getGoogleOAuthStartUrl(API_BASE), []);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  useEffect(() => {
    if (!oauthMfaRequired) {
      return;
    }
    if (!oauthMfaToken) {
      setError("Google sign-in could not be completed. Please try again.");
      router.replace("/login");
      return;
    }
    try {
      window.sessionStorage.setItem("rawdrive_mfa_token", oauthMfaToken);
    } catch {
      setError("This browser blocked secure session storage. Please try again.");
      router.replace("/login");
      return;
    }
    router.replace("/login/mfa");
  }, [oauthMfaRequired, oauthMfaToken, router]);

  useEffect(() => {
    if (oauthMfaRequired) {
      return;
    }
    if (!oauthAuthenticated) {
      return;
    }

    let cancelled = false;
    async function finishOAuthLogin() {
      const token = await refreshAuthSession(API_BASE);
      if (cancelled) {
        return;
      }
      if (!token) {
        setError("Google sign-in could not be completed. Please try again.");
        router.replace("/login");
        return;
      }
      router.replace(getPostLoginPath());
    }

    void finishOAuthLogin();
    return () => {
      cancelled = true;
    };
  }, [oauthAuthenticated, oauthMfaRequired, router]);

  useEffect(() => {
    if (registered) {
      setNotice("Account created. Please login below.");
      return;
    }

    const oauthMessage = friendlyOAuthError(oauthError);
    if (oauthMessage) {
      setError(oauthMessage);
    }
  }, [oauthError, registered]);

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const payload = await response.json().catch(() => ({}));
      
      if (response.status === 403 && payload.error === "account not activated") {
        router.push(`/activate?email=${encodeURIComponent(email.trim())}`);
        return;
      }

      // F-007 (M17 wave 3): MFA step-up. When the backend detects a verified
      // enrollment, Login returns 401 + { mfa_required, mfa_token, challenge }.
      // We stash the mfa_token in sessionStorage (short-lived, never written
      // to localStorage) and hand the user off to /login/mfa to complete the
      // TOTP check. The mfa_token is a 5-minute JWT with purpose=mfa_challenge
      // that the backend's /auth/verify-totp endpoint accepts as its own
      // credential.
      if (response.status === 401 && payload.mfa_required && payload.mfa_token) {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("rawdrive_mfa_token", payload.mfa_token);
        }
        router.push("/login/mfa");
        return;
      }

      if (!response.ok) {
        setError(payload.error || "Login failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      persistAuthTokens(payload.access_token);
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
        <div className="rounded-2xl border border-border bg-accent-subtle px-4 py-3 text-sm text-accent">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (isAndroidWebView()) {
            setWebviewNotice(true);
          } else {
            window.location.assign(googleStartUrl);
          }
        }}
        className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container-low px-4 py-4 font-medium text-text-primary transition-colors hover:bg-surface-container-high"
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

      {webviewNotice ? (
        <div className="rounded-2xl border border-border bg-surface-container-low px-4 py-4 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">
            Google sign-in requires Chrome
          </p>
          <p className="mt-1">
            This browser can&apos;t open Google&apos;s sign-in page. Open RawDrive in
            Chrome to continue.
          </p>
          <button
            type="button"
            onClick={() => openPageInChrome(window.location.href)}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Open in Chrome
          </button>
        </div>
      ) : null}

      <div className="relative flex items-center py-2">
        <div className="soft-divider flex-grow" />
        <span className="mx-4 text-xs font-bold tracking-[0.24em] text-text-tertiary">OR</span>
        <div className="soft-divider flex-grow" />
      </div>

      <p className="text-sm text-text-secondary">Enter your details to access your studio</p>

      <form onSubmit={handleLogin} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="login-email"
              className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary"
            >
              Email Address
            </label>
            <div className="group relative">
              <input
                id="login-email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@photographer.com"
                className="input-base w-full pr-12"
                autoComplete="email"
                required
              />
              <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary transition-colors group-focus-within:text-accent" />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="login-password"
              className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary"
            >
              Password
            </label>
            <div className="group relative">
              <input
                id="login-password"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="input-base w-full pr-12"
                autoComplete="current-password"
                required
              />
              <KeyRound className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary transition-colors group-focus-within:text-accent" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-accent transition-colors hover:text-accent-hover"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="btn-primary w-full py-4 font-headline text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="text-center">
        <p className="text-sm text-text-secondary">
          Don&apos;t have an account?
          <Link
            href="/register"
            className="ml-1 font-bold text-accent transition-colors hover:text-accent-hover"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
