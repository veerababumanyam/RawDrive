"use client";

import { useState, useEffect } from "react";

// ──────────────────────── Types ────────────────────────

type Provider = "r2" | "s3" | "minio" | "b2";
type WizardStep = 1 | 2 | 3;
type PlanTier = "free" | "starter" | "professional" | "enterprise";

interface StorageConfig {
  provider: Provider;
  bucketName: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

const BYOS_PROVIDERS: { id: Provider; name: string; desc: string }[] = [
  { id: "s3", name: "AWS S3", desc: "Industry standard object storage" },
  { id: "minio", name: "MinIO", desc: "Self-hosted S3-compatible" },
  { id: "b2", name: "Backblaze B2", desc: "Affordable cloud storage" },
];

// ──────────────────────── Page ────────────────────────

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

export default function StorageSettingsPage() {
  // TODO: Read from auth context / workspace API
  const [planTier] = useState<PlanTier>("professional");
  const isEnterprise = planTier === "enterprise";

  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8229";
    fetch(`${apiUrl}/api/v1/storage/analytics`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.data) setAnalytics(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const usage = analytics?.usage;
  const usedDisplay = usage ? formatBytes(usage.used_bytes) : "—";
  const quotaDisplay = usage ? formatBytes(usage.quota_bytes) : "—";
  const pctUsed = usage?.percent_used ?? 0;
  const warningLevel = usage?.warning_level ?? "none";

  const [step, setStep] = useState<WizardStep>(1);
  const [config, setConfig] = useState<StorageConfig>({
    provider: "s3", bucketName: "", region: "", endpoint: "", accessKey: "", secretKey: "",
  });
  const [testResult, setTestResult] = useState<"idle" | "testing" | "success" | "error">("idle");

  const handleTestConnection = async () => {
    setTestResult("testing");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8229";
      const res = await fetch(`${apiUrl}/api/v1/workspaces/current/storage-config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface p-8">
      <div className="max-w-4xl mx-auto">
        <nav className="text-xs text-on-surface-variant mb-2">Settings <span className="mx-1">&rsaquo;</span> Storage</nav>
        <h1 className="text-2xl font-semibold font-headline mb-8">Storage Settings</h1>

        {/* ────────── Current Storage Status (all plans) ────────── */}
        <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-on-surface-variant">Storage Provider</p>
              <p className="text-lg font-semibold">Cloudflare R2</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Managed by RawDrive — zero egress, global CDN</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${warningLevel === "critical" ? "bg-feedback-error/10 text-feedback-error" : warningLevel === "warning" ? "bg-feedback-warning/10 text-feedback-warning" : "bg-primary/10 text-primary"}`}>
              {warningLevel === "critical" ? "Storage Critical" : warningLevel === "warning" ? "Storage Warning" : "Active"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div className={`h-full rounded-full ${warningLevel === "critical" ? "bg-feedback-error" : warningLevel === "warning" ? "bg-feedback-warning" : "bg-gradient-to-r from-primary to-primary-container"}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">{loading ? "Loading..." : `${usedDisplay} / ${quotaDisplay} used`}</p>
        </div>

        {/* ────────── BYOS Section (enterprise only) ────────── */}
        {!isEnterprise ? (
          /* Non-enterprise: show upgrade prompt */
          <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-lg">🔒</div>
              <div>
                <h3 className="text-sm font-semibold">Bring Your Own Storage (BYOS)</h3>
                <p className="text-xs text-on-surface-variant">Available on Enterprise plan only</p>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">
              Connect your own AWS S3, MinIO, or Backblaze B2 bucket for full control over your storage infrastructure.
              All standard and professional plans use Cloudflare R2 managed by RawDrive.
            </p>
            <button className="px-5 py-2 text-xs font-medium rounded-xl border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
              Upgrade to Enterprise
            </button>
          </div>
        ) : (
          /* Enterprise: show BYOS wizard */
          <>
            <h2 className="text-lg font-semibold mb-4">Bring Your Own Storage</h2>
            <p className="text-xs text-on-surface-variant mb-6">
              Enterprise plan — connect your own storage bucket. Cloudflare R2 remains the default; BYOS is an additional option.
            </p>

            {/* Stepper */}
            <div className="flex items-center gap-2 mb-8">
              {([1, 2, 3] as WizardStep[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${s <= step ? "bg-primary/20 text-primary" : "bg-surface-container text-on-surface-variant"}`}>{s}</div>
                  <span className={`text-xs ${s <= step ? "text-on-surface" : "text-on-surface-variant"}`}>{s === 1 ? "Provider" : s === 2 ? "Credentials" : "Confirm"}</span>
                  {s < 3 && <div className={`w-12 h-px ${s < step ? "bg-primary" : "bg-surface-container"}`} />}
                </div>
              ))}
            </div>

            {/* Step 1: Choose BYOS Provider (R2 is NOT an option — it's the default) */}
            {step === 1 && (
              <div className="space-y-3 mb-8">
                {BYOS_PROVIDERS.map((p) => (
                  <button key={p.id} onClick={() => setConfig((c) => ({ ...c, provider: p.id }))}
                    className={`w-full p-4 rounded-2xl text-left transition-all backdrop-blur-md border ${config.provider === p.id ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-container" />
                      <div>
                        <span className="font-semibold text-sm">{p.name}</span>
                        <p className="text-xs text-on-surface-variant">{p.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
                <div className="flex justify-end mt-4">
                  <button onClick={() => setStep(2)} className="px-6 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary">Next</button>
                </div>
              </div>
            )}

            {/* Step 2: Credentials */}
            {step === 2 && (
              <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
                <div className="space-y-4">
                  {[
                    { key: "bucketName", label: "Bucket Name", type: "text", placeholder: "my-studio-bucket" },
                    { key: "region", label: "Region", type: "text", placeholder: "us-east-1" },
                    { key: "endpoint", label: "Endpoint URL", type: "text", placeholder: "https://s3.amazonaws.com" },
                    { key: "accessKey", label: "Access Key ID", type: "password", placeholder: "Enter access key" },
                    { key: "secretKey", label: "Secret Access Key", type: "password", placeholder: "Enter secret key" },
                  ].map((field) => (
                    <label key={field.key} className="block">
                      <span className="text-xs text-on-surface-variant">{field.label}</span>
                      <input type={field.type} placeholder={field.placeholder}
                        value={(config as unknown as Record<string, string>)[field.key] || ""}
                        onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                        className="mt-1 w-full px-4 py-2.5 rounded-xl bg-surface-container border border-white/10 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </label>
                  ))}
                  <button onClick={handleTestConnection} disabled={testResult === "testing"}
                    className="px-5 py-2 text-sm rounded-xl border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50">
                    {testResult === "testing" ? "Testing..." : testResult === "success" ? "Connected" : testResult === "error" ? "Failed — Retry" : "Test Connection"}
                  </button>
                  {testResult === "success" && <p className="text-xs text-feedback-success">Connection successful.</p>}
                  {testResult === "error" && <p className="text-xs text-feedback-error">Connection failed — check credentials.</p>}
                </div>
                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(1)} className="px-5 py-2 text-sm rounded-xl border border-white/10 hover:bg-white/5">Back</button>
                  <button onClick={() => setStep(3)} disabled={testResult !== "success"}
                    className="px-6 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary disabled:opacity-40">Next</button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div className="rounded-2xl backdrop-blur-md bg-white/[0.04] border border-white/10 p-6 mb-8">
                <h3 className="text-sm font-semibold mb-4">Configuration Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-on-surface-variant">Provider</span><span>{BYOS_PROVIDERS.find((p) => p.id === config.provider)?.name}</span></div>
                  <div className="flex justify-between"><span className="text-on-surface-variant">Bucket</span><span>{config.bucketName || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-on-surface-variant">Region</span><span>{config.region || "—"}</span></div>
                </div>
                <p className="text-xs text-on-surface-variant mt-4 p-3 rounded-xl bg-surface-container border border-white/5">
                  Existing assets on Cloudflare R2 will be migrated in the background. This may take several hours for large galleries.
                </p>
                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(2)} className="px-5 py-2 text-sm rounded-xl border border-white/10 hover:bg-white/5">Back</button>
                  <button className="px-6 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary">Activate BYOS Storage</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ────────── Storage Analytics (all plans) ────────── */}
        <h2 className="text-lg font-semibold mt-12 mb-4">Storage Analytics</h2>
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
