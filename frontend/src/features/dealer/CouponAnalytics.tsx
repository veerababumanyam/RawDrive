// Design source: Stitch MCP — Coupon analytics stat cards (glass-card, accent colors)
"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Analytics { coupon_id: string; total_uses: number; unique_users: number; revenue_impact: number; }

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

export default function CouponAnalytics({ couponId }: { couponId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/admin/coupons/${couponId}/analytics`).then(r => r.ok ? r.json() : null).then(d => setData(d?.analytics || d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [couponId]);

  if (loading) return <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="glass-card p-6 h-24 animate-pulse rounded-xl" />)}</div>;
  if (!data) return <p className="text-text-secondary text-center py-4">No analytics available.</p>;

  const stats = [
    { label: "Total Uses", value: data.total_uses.toLocaleString(), color: "text-accent-primary" },
    { label: "Unique Users", value: data.unique_users.toLocaleString(), color: "text-accent-secondary" },
    { label: "Revenue Impact", value: formatPaisa(data.revenue_impact), color: "text-green-400" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map(s => (
        <div key={s.label} className="glass-card p-6 rounded-xl text-center">
          <p className="text-xs text-text-tertiary uppercase tracking-wider">{s.label}</p>
          <p className={`text-2xl font-semibold mt-2 ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
