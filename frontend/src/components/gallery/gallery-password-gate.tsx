"use client";

import { useState } from "react";

interface Props {
  slug: string;
  brandName?: string;
  logoUrl?: string | null;
  children: React.ReactNode;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

export function GalleryPasswordGate({ slug, brandName = "RawDrive", logoUrl, children }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(`gallery_unlocked_${slug}`) === "true";
  });

  if (unlocked) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem(`gallery_unlocked_${slug}`, "true");
        setUnlocked(true);
      } else if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes.");
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="max-w-sm w-full mx-4">
        <div className="surface-panel p-8 text-center">
          {logoUrl ? (
            <img
              src={absoluteApiUrl(logoUrl)}
              alt={`${brandName} logo`}
              className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-surface-sunken object-contain p-2"
            />
          ) : (
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface-sunken flex items-center justify-center">
            <svg className="w-7 h-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          )}
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">{brandName}</p>
          <h1 className="text-xl font-semibold text-text-primary">This gallery is protected</h1>
          <p className="mt-2 text-sm text-text-secondary">Enter the password to view photos.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Gallery password"
              className="input-base w-full text-center"
              autoFocus
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="submit"
              disabled={!password || loading}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-accent-primary text-accent-primary-contrast hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Enter Gallery"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
