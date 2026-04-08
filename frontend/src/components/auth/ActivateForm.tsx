"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { persistAuthTokens, getPostLoginPath } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!email) {
    return (
      <div className="text-center text-sm text-text-secondary">
        Invalid session. Please return to the{" "}
        <a href="/login" className="text-accent underline text-bold hover:text-accent-hover">login page</a>.
      </div>
    );
  }

  async function handleVerifyOtp() {
    if (otpCode.trim().length < 6) return;

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
    <div className="mt-8 space-y-6">
      {error ? (
        <div className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      ) : null}

      <div className="text-center text-sm text-text-secondary">
        We sent an activation code to <strong className="text-text-primary">{email}</strong>.
      </div>

      <div className="space-y-4">
        <label
          htmlFor="otp-code"
          className="block pl-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary"
        >
          Activation Code
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
          className="input-base w-full text-center text-2xl tracking-[0.45em]"
          autoFocus
        />
      </div>

      <button
        type="button"
        onClick={() => void handleVerifyOtp()}
        disabled={loading || otpCode.length < 6}
        className="btn-primary w-full py-4 font-headline text-base disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Activating..." : "Verify & Activate"}
      </button>

      <div className="text-center">
         <button 
           type="button" 
           onClick={() => router.push('/login')} 
           className="text-sm font-semibold text-text-tertiary transition-colors hover:text-text-primary">
            Back to login
         </button>
      </div>
    </div>
  );
}
