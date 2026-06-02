"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getSystemMetrics,
  listPlatformSettings,
  savePlatformSetting,
  type PlatformSetting,
  type SystemMetrics,
} from "@/lib/api/admin";

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function LatencyCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  const color = value < 50 ? "text-secondary" : value < 100 ? "text-feedback-warning" : "text-feedback-error";
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${color}`}>{value} <span className="text-sm font-normal text-text-secondary">{unit}</span></p>
    </div>
  );
}

function InfraCard({ label, value, unit, pct }: { label: string; value: string; unit?: string; pct?: number }) {
  const color = pct !== undefined ? (pct < 60 ? "text-feedback-success" : pct < 80 ? "text-feedback-warning" : "text-feedback-error") : "text-on-surface";
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${color}`}>
        {value}{unit && <span className="text-sm font-normal text-text-secondary ml-1">{unit}</span>}
      </p>
      {pct !== undefined && (
        <div className="mt-3 w-full h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
          <div className={`h-full rounded-full ${pct < 60 ? "bg-feedback-success" : pct < 80 ? "bg-feedback-warning" : "bg-feedback-error"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

type PaymentProvider = "razorpay" | "phonepe";

interface PaymentGatewayField {
  key: string;
  label: string;
  provider: PaymentProvider;
  isSecret: boolean;
  required: boolean;
  envFallback: string;
  placeholder: string;
  description: string;
}

const PAYMENT_GATEWAY_FIELDS: PaymentGatewayField[] = [
  {
    key: "razorpay_key_id",
    label: "Razorpay Key ID",
    provider: "razorpay",
    isSecret: false,
    required: true,
    envFallback: "RAZORPAY_KEY_ID",
    placeholder: "rzp_live_...",
    description: "Public checkout key returned to the browser.",
  },
  {
    key: "razorpay_key_secret",
    label: "Razorpay Key Secret",
    provider: "razorpay",
    isSecret: true,
    required: true,
    envFallback: "RAZORPAY_KEY_SECRET",
    placeholder: "Leave blank to keep current secret",
    description: "Server-side order and signature verification secret.",
  },
  {
    key: "razorpay_webhook_secret",
    label: "Razorpay Webhook Secret",
    provider: "razorpay",
    isSecret: true,
    required: true,
    envFallback: "RAZORPAY_WEBHOOK_SECRET",
    placeholder: "Leave blank to keep current secret",
    description: "Secret used to verify subscription payment webhooks.",
  },
  {
    key: "razorpay_base_url",
    label: "Razorpay Base URL",
    provider: "razorpay",
    isSecret: false,
    required: false,
    envFallback: "RAZORPAY_BASE_URL",
    placeholder: "https://api.razorpay.com",
    description: "Optional API override; defaults to Razorpay production.",
  },
  {
    key: "phonepe_client_id",
    label: "PhonePe Client ID",
    provider: "phonepe",
    isSecret: false,
    required: true,
    envFallback: "PHONEPE_CLIENT_ID / PHONEPE_CLIENTID",
    placeholder: "PhonePe OAuth client id",
    description: "Standard Checkout v2 OAuth client identifier.",
  },
  {
    key: "phonepe_client_secret",
    label: "PhonePe Client Secret",
    provider: "phonepe",
    isSecret: true,
    required: true,
    envFallback: "PHONEPE_CLIENT_SECRET / PHONEPE_SECRET",
    placeholder: "Leave blank to keep current secret",
    description: "Standard Checkout v2 OAuth client secret.",
  },
  {
    key: "phonepe_client_version",
    label: "PhonePe Client Version",
    provider: "phonepe",
    isSecret: false,
    required: false,
    envFallback: "PHONEPE_CLIENT_VERSION / PHONEPE_VERSION",
    placeholder: "1",
    description: "Merchant client version assigned by PhonePe. Defaults to 1 when unset.",
  },
  {
    key: "phonepe_v2_base_url",
    label: "PhonePe V2 Pay Base URL",
    provider: "phonepe",
    isSecret: false,
    required: false,
    envFallback: "PHONEPE_V2_BASE_URL / PHONEPE_BASE_URL",
    placeholder: "https://api.phonepe.com/apis/pg",
    description: "V2 pay/status host. Defaults to PhonePe production; do not use the legacy Hermes URL here.",
  },
  {
    key: "phonepe_v2_auth_base_url",
    label: "PhonePe V2 Auth Base URL",
    provider: "phonepe",
    isSecret: false,
    required: false,
    envFallback: "PHONEPE_V2_AUTH_BASE_URL / PHONEPE_AUTH_BASE_URL",
    placeholder: "https://api.phonepe.com/apis/identity-manager",
    description: "OAuth host. Required for production; sandbox can share the pay base URL.",
  },
  {
    key: "public_base_url",
    label: "Public Callback Base URL",
    provider: "phonepe",
    isSecret: false,
    required: true,
    envFallback: "PUBLIC_BASE_URL / FRONTEND_URL",
    placeholder: "https://app.rawdrive.in",
    description: "Origin PhonePe redirects back to after hosted checkout.",
  },
  {
    key: "phonepe_webhook_username",
    label: "PhonePe Webhook Username",
    provider: "phonepe",
    isSecret: false,
    required: false,
    envFallback: "PHONEPE_WEBHOOK_USERNAME",
    placeholder: "PhonePe dashboard callback username",
    description: "Username configured in the PhonePe callback dashboard. Required only for asynchronous callbacks.",
  },
  {
    key: "phonepe_webhook_password",
    label: "PhonePe Webhook Password",
    provider: "phonepe",
    isSecret: true,
    required: false,
    envFallback: "PHONEPE_WEBHOOK_PASSWORD",
    placeholder: "Leave blank to keep current secret",
    description: "Password used for PhonePe callback authorization hash. Required only for asynchronous callbacks.",
  },
];

function emptyPaymentForm(): Record<string, string> {
  return Object.fromEntries(PAYMENT_GATEWAY_FIELDS.map((field) => [field.key, ""]));
}

function settingHasValue(setting?: PlatformSetting): boolean {
  return Boolean(setting?.value?.trim());
}

export default function AdminSystemPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<Record<string, PlatformSetting>>({});
  const [paymentForm, setPaymentForm] = useState<Record<string, string>>(emptyPaymentForm);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSaved, setPaymentSaved] = useState(false);

  const loadPaymentSettings = useCallback(async (token: string) => {
    setPaymentLoading(true);
    try {
      const rows = await listPlatformSettings(token, "payments");
      const byKey = Object.fromEntries(rows.map((setting) => [setting.key, setting]));
      setPaymentSettings(byKey);
      setPaymentForm(
        Object.fromEntries(
          PAYMENT_GATEWAY_FIELDS.map((field) => [
            field.key,
            field.isSecret ? "" : byKey[field.key]?.value ?? "",
          ]),
        ),
      );
      setPaymentError(null);
    } catch {
      setPaymentError("Failed to load payment gateway settings");
    } finally {
      setPaymentLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
    getSystemMetrics(token)
      .then((data) => { setMetrics(data); setError(null); })
      .catch(() => setError("Failed to load system metrics"))
      .finally(() => setLoading(false));
    void loadPaymentSettings(token);
  }, [loadPaymentSettings]);

  const readiness = useMemo(() => {
    const hasField = (field: PaymentGatewayField) => {
      if (!field.required) return true;
      return settingHasValue(paymentSettings[field.key]) || Boolean(paymentForm[field.key]?.trim());
    };
    return {
      razorpay: PAYMENT_GATEWAY_FIELDS.filter((field) => field.provider === "razorpay" && field.required).every(hasField),
      phonepe: PAYMENT_GATEWAY_FIELDS.filter((field) => field.provider === "phonepe" && field.required).every(hasField),
    };
  }, [paymentForm, paymentSettings]);

  const savePaymentGateways = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPaymentSaving(true);
    setPaymentSaved(false);
    setPaymentError(null);
    try {
      const token = getStoredAccessToken();
      await Promise.all(
        PAYMENT_GATEWAY_FIELDS.flatMap((field) => {
          const value = paymentForm[field.key]?.trim() ?? "";
          if (field.isSecret && value === "") return [];
          return savePlatformSetting(token, "payments", field.key, {
            value,
            is_secret: field.isSecret,
            description: field.description,
          });
        }),
      );
      await loadPaymentSettings(token);
      setPaymentSaved(true);
    } catch {
      setPaymentError("Failed to save payment gateway settings");
    } finally {
      setPaymentSaving(false);
    }
  };

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading system metrics...</p></div>;
  if (error || !metrics) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-feedback-error">{error || "No data"}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">System Health</h2>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-feedback-success/10 text-feedback-success text-xs font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-feedback-success animate-pulse" />
          All Systems Operational
        </span>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">API Latency</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LatencyCard label="p50" value={metrics.api_latency_p50_ms} unit="ms" />
          <LatencyCard label="p95" value={metrics.api_latency_p95_ms} unit="ms" />
          <LatencyCard label="p99" value={metrics.api_latency_p99_ms} unit="ms" />
        </div>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Infrastructure</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <InfraCard label="Error Rate" value={`${metrics.error_rate_pct}%`} pct={metrics.error_rate_pct * 10} />
          <InfraCard label="Queue Depth" value={String(metrics.queue_depth)} />
          <InfraCard label="Storage" value={formatBytes(metrics.storage_used_bytes)} />
          <InfraCard label="CPU" value={`${Math.round(metrics.cpu_usage_pct ?? 0)}%`} pct={metrics.cpu_usage_pct ?? 0} />
          <InfraCard label="Memory" value={`${Math.round(metrics.memory_usage_pct ?? 0)}%`} pct={metrics.memory_usage_pct ?? 0} />
          <InfraCard label="Disk" value={`${Math.round(metrics.disk_usage_pct ?? 0)}%`} pct={metrics.disk_usage_pct ?? 0} />
        </div>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Uptime</h3>
        <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-8 rounded-2xl inline-block">
          <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">System Uptime</p>
          <p className="text-5xl font-bold text-on-surface font-headline mt-2">{formatUptime(metrics.uptime_seconds)}</p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-headline text-xl font-bold text-on-surface">Payment Gateways</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Database settings are used first. Empty values fall back to environment variables.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readiness.razorpay ? "bg-feedback-success/10 text-feedback-success" : "bg-feedback-warning/10 text-feedback-warning"}`}>
              Razorpay {readiness.razorpay ? "DB complete" : "uses env fallback"}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readiness.phonepe ? "bg-feedback-success/10 text-feedback-success" : "bg-feedback-warning/10 text-feedback-warning"}`}>
              PhonePe {readiness.phonepe ? "DB checkout complete" : "uses env fallback"}
            </span>
          </div>
        </div>

        <form onSubmit={savePaymentGateways} className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl space-y-6">
          {paymentLoading ? (
            <p className="text-sm text-text-secondary">Loading payment gateway settings...</p>
          ) : (
            <>
              {(["razorpay", "phonepe"] as const).map((provider) => (
                <div key={provider} className="space-y-3">
                  <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-text-secondary">
                    {provider === "razorpay" ? "Razorpay" : "PhonePe Standard Checkout V2"}
                  </h4>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {PAYMENT_GATEWAY_FIELDS.filter((field) => field.provider === provider).map((field) => {
                      const saved = settingHasValue(paymentSettings[field.key]);
                      return (
                        <label key={field.key} className="block rounded-xl border border-border-subtle bg-surface-container-lowest/50 p-4">
                          <span className="flex items-center justify-between gap-3 text-sm font-semibold text-on-surface">
                            {field.label}
                            {field.required && <span className="text-[10px] uppercase tracking-[0.08em] text-feedback-warning">Required</span>}
                          </span>
                          <input
                            type={field.isSecret ? "password" : "text"}
                            value={paymentForm[field.key] ?? ""}
                            onChange={(event) => {
                              setPaymentSaved(false);
                              setPaymentForm((current) => ({ ...current, [field.key]: event.target.value }));
                            }}
                            placeholder={field.isSecret && saved ? "Saved secret - leave blank to keep" : field.placeholder}
                            autoComplete="off"
                            className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
                          />
                          <span className="mt-2 block text-xs text-text-tertiary">
                            Env fallback: <code>{field.envFallback}</code>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {paymentError && <p className="text-sm font-medium text-feedback-error">{paymentError}</p>}
              {paymentSaved && <p className="text-sm font-medium text-feedback-success">Payment gateway settings saved.</p>}

              <button
                type="submit"
                disabled={paymentSaving}
                className="min-h-11 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentSaving ? "Saving..." : "Save Payment Settings"}
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
