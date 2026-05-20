"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getStoredAccessToken } from "@/lib/auth";

// ──────────────────────── Types ────────────────────────

type PlanTier = "free" | "starter" | "professional" | "enterprise" | "standard";

interface StorageAnalytics {
  usage: { used_bytes: number; derivative_bytes: number; quota_bytes: number; percent_used: number; warning_level: string };
  top_galleries: { gallery_id: string; gallery_name: string; used_bytes: number }[];
  type_breakdown: { originals_bytes: number; derivatives_bytes: number; thumbnails_bytes: number };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ──────────────────────── Page ────────────────────────

export default function StorageSettingsPage() {
  // F-011 (audit 2026-04-10): plan tier was previously hardcoded to
  // "professional" with a TODO, which hid the BYOS wizard from enterprise
  // users AND showed a misleading "Upgrade" prompt to everyone else. Source
  // it from the authoritative backend endpoint that reads from the DB.
  const [planTier, setPlanTier] = useState<PlanTier | null>(null);
  const isEnterprise = planTier === "enterprise";
  const planLoaded = planTier !== null;

  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const token = getStoredAccessToken();
    fetch(`${apiUrl}/api/v1/storage/analytics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.data) setAnalytics(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // F-011: fetch authoritative plan tier. This is a separate effect so
  // analytics and plan-tier load independently — one failing does not
  // block the other.
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const token = getStoredAccessToken();
    fetch(`${apiUrl}/api/v1/workspaces/current/plan`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const tier = data?.plan_tier as PlanTier | undefined;
        setPlanTier(tier ?? "standard");
      })
      .catch(() => setPlanTier("standard"));
  }, []);

  const usage = analytics?.usage;
  const usedDisplay = usage ? formatBytes(usage.used_bytes) : "—";
  const quotaDisplay = usage ? formatBytes(usage.quota_bytes) : "—";
  const pctUsed = usage?.percent_used ?? 0;
  const warningLevel = usage?.warning_level ?? "none";

  return (
    <div className="min-h-screen bg-surface text-on-surface p-8">
      <div className="max-w-4xl mx-auto">
        <nav className="text-xs text-on-surface-variant mb-2">Settings <span className="mx-1">&rsaquo;</span> Storage</nav>
        <h1 className="text-2xl font-semibold font-headline mb-8">Storage Settings</h1>

        {/* ────────── Current Storage Usage (all plans) ────────── */}
        <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-on-surface-variant">Storage Used</p>
            <span className={`text-xs px-3 py-1 rounded-full ${warningLevel === "critical" ? "bg-feedback-error/10 text-feedback-error" : warningLevel === "warning" ? "bg-feedback-warning/10 text-feedback-warning" : "bg-primary/10 text-primary"}`}>
              {warningLevel === "critical" ? "Storage Critical" : warningLevel === "warning" ? "Storage Warning" : "Active"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div className={`h-full rounded-full ${warningLevel === "critical" ? "bg-feedback-error" : warningLevel === "warning" ? "bg-feedback-warning" : "bg-gradient-to-r from-primary to-primary-container"}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">{loading ? "Loading..." : `${usedDisplay} / ${quotaDisplay} used`}</p>
        </div>

        {/* ────────── Upgrade prompt (non-enterprise only) ────────── */}
        {planLoaded && !isEnterprise && (
          <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-lg">⚡</div>
              <div>
                <h3 className="text-sm font-semibold">Need more storage?</h3>
                <p className="text-xs text-on-surface-variant">Upgrade your plan to unlock additional storage and features.</p>
              </div>
            </div>
            <Link
              href="/settings/plans"
              className="inline-block px-5 py-2 text-xs font-medium rounded-xl border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
            >
              Upgrade Plan
            </Link>
          </div>
        )}

        {/* ────────── Storage Analytics (all plans) ────────── */}
        <h2 className="text-lg font-semibold mt-4 mb-4">Storage Analytics</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-5">
            <h3 className="text-sm font-medium mb-4">Top Galleries by Size</h3>
            {analytics?.top_galleries && analytics.top_galleries.length > 0 ? (
              analytics.top_galleries.map((g) => {
                const maxBytes = analytics.top_galleries[0]?.used_bytes || 1;
                const pct = Math.round((g.used_bytes / maxBytes) * 100);
                return (
                  <div key={g.gallery_id} className="mb-3">
                    <div className="flex justify-between text-xs mb-1"><span>{g.gallery_name}</span><span className="text-on-surface-variant">{formatBytes(g.used_bytes)}</span></div>
                    <div className="h-1.5 rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-on-surface-variant">{loading ? "Loading..." : "No gallery data yet"}</p>
            )}
          </div>
          <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-5">
            <h3 className="text-sm font-medium mb-4">Storage Distribution</h3>
            {(() => {
              const tb = analytics?.type_breakdown;
              const total = (tb?.originals_bytes ?? 0) + (tb?.derivatives_bytes ?? 0) + (tb?.thumbnails_bytes ?? 0);
              const origPct = total > 0 ? Math.round(((tb?.originals_bytes ?? 0) / total) * 100) : 0;
              const derivPct = total > 0 ? Math.round(((tb?.derivatives_bytes ?? 0) / total) * 100) : 0;
              const thumbPct = total > 0 ? 100 - origPct - derivPct : 0;
              return (
                <>
                  <div className="flex items-center justify-center h-32">
                    <div className="w-28 h-28 rounded-full border-[12px] border-primary/60 border-t-secondary/60 border-r-tertiary/40" />
                  </div>
                  <div className="space-y-2 mt-4">
                    {[
                      { label: "Originals", value: formatBytes(tb?.originals_bytes ?? 0), pct: `${origPct}%`, color: "bg-primary/60" },
                      { label: "Derivatives", value: formatBytes(tb?.derivatives_bytes ?? 0), pct: `${derivPct}%`, color: "bg-secondary/60" },
                      { label: "Thumbnails", value: formatBytes(tb?.thumbnails_bytes ?? 0), pct: `${thumbPct}%`, color: "bg-tertiary/40" },
                    ].map((t) => (
                      <div key={t.label} className="flex items-center gap-2 text-xs">
                        <div className={`w-2.5 h-2.5 rounded-full ${t.color}`} />
                        <span className="text-on-surface-variant">{t.label}</span>
                        <span className="ml-auto text-on-surface-variant">{t.value}</span>
                        <span className="w-8 text-right">{t.pct}</span>
                      </div>
                    ))}
                    {total === 0 && !loading && <p className="text-xs text-on-surface-variant text-center mt-2">No storage data yet</p>}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
