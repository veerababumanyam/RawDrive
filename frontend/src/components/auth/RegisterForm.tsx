"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { getGoogleOAuthStartUrl } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const indianStates = [
  "Maharashtra",
  "Karnataka",
  "Delhi",
  "Telangana",
  "Tamil Nadu",
  "West Bengal",
  "Gujarat",
];

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const googleStartUrl = useMemo(() => getGoogleOAuthStartUrl(API_BASE), []);

  async function handleRegister(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!email.trim() || !termsAccepted) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "We could not create your account.");
        return;
      }

      router.push(`/login?registered=1&email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError("Network error. Please confirm the API server is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleRegister(event)}>
      {error ? (
        <div className="rounded-2xl border border-[#fe8983]/40 bg-[#fff7f6] px-4 py-3 text-sm text-[#752121]">
          {error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="register-name"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6061]"
        >
          Full name
        </label>
        <input
          id="register-name"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Arjun Malhotra"
          className="h-12 w-full rounded-xl border-none bg-[#f2f4f4] px-4 text-[#2d3435] placeholder:text-[#adb3b4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5f5e5e]/20"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-email"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6061]"
        >
          Email address
        </label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="arjun@studio.in"
          className="h-12 w-full rounded-xl border-none bg-[#f2f4f4] px-4 text-[#2d3435] placeholder:text-[#adb3b4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5f5e5e]/20"
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-phone"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6061]"
        >
          Phone number
        </label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 border-r border-[#adb3b4]/30 pr-3">
            <span className="text-lg">IN</span>
            <span className="text-sm font-semibold text-[#2d3435]">+91</span>
          </div>
          <input
            id="register-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="98765 43210"
            className="h-12 w-full rounded-xl border-none bg-[#f2f4f4] pl-24 pr-4 text-[#2d3435] placeholder:text-[#adb3b4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5f5e5e]/20"
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-password"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6061]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="h-12 w-full rounded-xl border-none bg-[#f2f4f4] px-4 pr-12 text-[#2d3435] placeholder:text-[#adb3b4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5f5e5e]/20"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757c7d]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="register-state"
          className="ml-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6061]"
        >
          Business Location
        </label>
        <div className="relative">
          <select
            id="register-state"
            value={stateValue}
            onChange={(event) => setStateValue(event.target.value)}
            className="h-12 w-full appearance-none rounded-xl border-none bg-[#f2f4f4] px-4 text-[#2d3435] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5f5e5e]/20"
          >
            <option value="">Select State</option>
            {indianStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#757c7d]" />
        </div>
      </div>

      <div className="flex items-start gap-3 py-1">
        <input
          id="terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-[#adb3b4] bg-[#f2f4f4] text-[#2d3435] focus:ring-[#5f5e5e]/20"
        />
        <label htmlFor="terms" className="text-sm leading-tight text-[#5c6060]">
          I accept the{" "}
          <Link href="/terms" className="font-semibold text-[#2d3435] underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-[#2d3435] underline underline-offset-2">
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !email.trim() || !termsAccepted}
        className="font-headline mt-2 h-14 w-full rounded-xl bg-[#2d3435] font-bold text-white shadow-lg shadow-[#2d3435]/10 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating Account..." : "Create Account"}
      </button>

      <div className="mt-8 space-y-6">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#e4e9ea]" />
          </div>
          <span className="relative bg-white px-4 text-xs font-bold uppercase tracking-[0.22em] text-[#757c7d]">
            or continue with
          </span>
        </div>

        <button
          type="button"
          onClick={() => window.location.assign(googleStartUrl)}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#f2f4f4] font-semibold text-[#5a6061] transition-colors hover:bg-[#e4e9ea]"
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
          Sign in with Google
        </button>

        <div className="space-y-4 pt-2 text-center">
          <div className="h-px w-full bg-[#f2f4f4]" />
          <p className="text-sm text-[#5c6060]">
            Already have an account?
            <Link
              href="/login"
              className="ml-1 font-bold text-[#2d3435] underline decoration-2 underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </form>
  );
}
