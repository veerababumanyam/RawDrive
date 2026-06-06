"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Crown,
  HardDrive,
  Zap,
} from "lucide-react";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface SubscriptionData {
  plan_tier: string;
  status: string;
  started_at?: string;
  expires_at?: string;
  days_left?: number;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  professional: "Professional",
  business: "Business",
  enterprise: "Enterprise",
};

const UPGRADE_HREF = "/settings/plans";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { plans } = usePlanCatalog();

  useEffect(() => {
    let cancelled = false;

    async function loadSubscription() {
      const token = getStoredAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/workspace/subscription`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextData = (await response.json()) as SubscriptionData;
        if (!cancelled) {
          setData(nextData);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load subscription",
          );
          setLoading(false);
        }
      }
    }

    void loadSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  const tierLabel = data
    ? (plans.find((p) => p.id === data.plan_tier)?.name ??
      TIER_LABELS[data.plan_tier] ??
      data.plan_tier)
    : "";
  const isFreeTier = !data || data.plan_tier === "free";
  const planStorage = data
    ? (plans.find((p) => p.id === data.plan_tier)?.storage ?? null)
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-8">
      <header className="flex items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">
            Subscription
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Your current plan and billing details.
          </p>
        </div>
      </header>

      {loading && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-text-secondary text-sm">
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 p-4 text-feedback-error text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Plan tier card */}
          <div className="rounded-xl border border-border-subtle bg-surface-container-low p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-accent">
                <Crown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                  Current Plan
                </p>
                <p className="text-xl font-bold text-on-surface">{tierLabel}</p>
              </div>
            </div>

            {planStorage && (
              <div className="flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2.5">
                <HardDrive className="h-4 w-4 shrink-0 text-text-tertiary" />
                <p className="text-sm text-on-surface">
                  <span className="font-semibold text-accent">
                    {planStorage}
                  </span>
                  <span className="text-text-secondary"> storage included</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
              {data.started_at && (
                <div className="flex items-start gap-2">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-text-tertiary" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      Started
                    </p>
                    <p className="text-sm text-on-surface">
                      {formatDate(data.started_at)}
                    </p>
                  </div>
                </div>
              )}

              {data.expires_at ? (
                <div className="flex items-start gap-2">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-text-tertiary" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      Expires
                    </p>
                    <p className="text-sm text-on-surface">
                      {formatDate(data.expires_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-text-tertiary" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      Expires
                    </p>
                    <p className="text-sm text-on-surface">No expiry</p>
                  </div>
                </div>
              )}

              {data.days_left !== undefined && data.days_left !== null && (
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-text-tertiary" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                      Days Left
                    </p>
                    <p
                      className={`text-sm font-semibold ${data.days_left <= 7 ? "text-feedback-warning" : "text-on-surface"}`}
                    >
                      {data.days_left} {data.days_left === 1 ? "day" : "days"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upgrade CTA */}
          {isFreeTier && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">
                  Unlock more with a paid plan
                </p>
                <p className="text-sm text-text-secondary">
                  More storage, advanced AI tools, priority support, and team
                  features.
                </p>
              </div>
              <Link
                href={UPGRADE_HREF}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
              >
                <Zap className="h-4 w-4" />
                Upgrade
              </Link>
            </div>
          )}

          {!isFreeTier && (
            <div className="rounded-xl border border-border-subtle bg-surface-container-low p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">
                  Need a higher tier?
                </p>
                <p className="text-sm text-text-secondary">
                  Compare plans and upgrade anytime.
                </p>
              </div>
              <Link
                href={UPGRADE_HREF}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-accent text-accent px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent/10"
              >
                <Zap className="h-4 w-4" />
                Change Plan
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
