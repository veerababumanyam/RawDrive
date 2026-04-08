// Design source: Stitch MCP Liquid Glass — Coupon Management screen (tabbed layout)
"use client";

import { useState, useEffect } from "react";

interface Coupon {
  id: string;
  code: string;
  coupon_type: string;
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
}

import CouponForm from "./CouponForm";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function CouponFormInline() {
  const handleSubmit = async (data: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/api/v1/dealers/coupons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json().catch(() => ({ error: "unknown" })); throw new Error(err.error || "Failed to create"); }
  };
  return <CouponForm onSubmit={handleSubmit} isDealer={true} />;
}

const typeColors: Record<string, string> = {
  percentage: "bg-accent-primary/10 text-accent-primary",
  fixed_amount: "bg-accent-secondary/10 text-accent-secondary",
  trial_extension: "bg-accent-tertiary/10 text-accent-tertiary",
};

function getStatus(c: Coupon): { label: string; color: string } {
  if (!c.is_active) return { label: "Paused", color: "bg-yellow-500/10 text-yellow-500" };
  if (c.valid_until && new Date(c.valid_until) < new Date()) return { label: "Expired", color: "bg-text-tertiary/10 text-text-tertiary" };
  if (c.max_redemptions && c.redemption_count >= c.max_redemptions) return { label: "Exhausted", color: "bg-feedback-error/10 text-feedback-error" };
  return { label: "Active", color: "bg-accent-secondary/10 text-accent-secondary" };
}

export default function CouponManagement() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/dealers/coupons`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    { key: "list", label: "My Coupons" },
    { key: "create", label: "Create Coupon" },
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Coupon Management</h1>

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-colors ${
              activeTab === tab.key
                ? "bg-accent-primary/20 text-accent-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "list" && (
        <div className="space-y-4">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-6 animate-pulse h-24 rounded-2xl" />
            ))
          ) : coupons.length === 0 ? (
            <div className="glass-card p-8 text-center text-text-secondary">No coupons yet.</div>
          ) : (
            coupons.map((coupon) => {
              const status = getStatus(coupon);
              return (
                <div key={coupon.id} className="glass-card p-6 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-mono font-bold text-accent-primary">{coupon.code}</p>
                    <div className="flex gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${typeColors[coupon.coupon_type] || "bg-surface-sunken text-text-secondary"}`}>
                        {coupon.coupon_type.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-text-secondary">
                      {coupon.redemption_count}/{coupon.max_redemptions ?? "∞"} used
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "create" && (
        <div className="glass-card p-6 max-w-lg space-y-4">
          <CouponFormInline />
        </div>
      )}
    </div>
  );
}
