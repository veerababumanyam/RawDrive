// Design source: Stitch MCP — Coupon Management Create tab (glass-card form, input-base fields)
"use client";

import { useState, type FormEvent } from "react";

const COUPON_TYPES = ["percentage", "fixed_amount", "trial_extension"] as const;

interface Props { onSubmit: (data: Record<string, unknown>) => Promise<void>; isDealer: boolean; }

export default function CouponForm({ onSubmit, isDealer }: Props) {
  const [code, setCode] = useState("");
  const [couponType, setCouponType] = useState<string>("percentage");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [maxRedemptions, setMaxRedemptions] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(true);
  const [perUserLimit, setPerUserLimit] = useState(1);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!code || code.length < 3) { setError("Code must be at least 3 characters"); return; }
    if (discountValue <= 0) { setError("Discount value must be greater than 0"); return; }
    if (couponType === "percentage" && discountValue > 10000) { setError("Percentage cannot exceed 100% (10000 basis points)"); return; }
    if (!validFrom) { setError("Valid from date is required"); return; }
    setSubmitting(true);
    try {
      await onSubmit({ code: code.toUpperCase(), coupon_type: couponType, discount_value: discountValue, max_redemptions: unlimited ? null : maxRedemptions, per_user_limit: perUserLimit, valid_from: validFrom, valid_until: validUntil || null, is_active: true, is_stackable: false });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create coupon"); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4 max-w-lg">
      {error && <div className="p-3 rounded-lg bg-feedback-error/10 text-feedback-error text-sm">{error}</div>}
      <div>
        <label className="text-sm text-text-secondary block mb-1">Coupon Code *</label>
        <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={50} className="input-base w-full min-h-[44px] font-mono" placeholder="DEAL-XXXXX" />
      </div>
      <div>
        <label className="text-sm text-text-secondary block mb-1">Type *</label>
        <select value={couponType} onChange={e => setCouponType(e.target.value)} className="input-base w-full min-h-[44px]">
          {COUPON_TYPES.filter(t => !isDealer || t !== "trial_extension").map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
      </div>
      <div>
        <label className="text-sm text-text-secondary block mb-1">Discount Value * {couponType === "percentage" ? "(basis points, 1500 = 15%)" : "(paisa)"}</label>
        <input type="number" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} min={1} className="input-base w-full min-h-[44px]" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} className="accent-accent-primary" /><span className="text-sm text-text-secondary">Unlimited redemptions</span></label>
        {!unlimited && <input type="number" value={maxRedemptions ?? 100} onChange={e => setMaxRedemptions(Number(e.target.value))} min={1} max={10000} className="input-base w-32 min-h-[44px]" />}
      </div>
      <div><label className="text-sm text-text-secondary block mb-1">Per-user limit</label><input type="number" value={perUserLimit} onChange={e => setPerUserLimit(Number(e.target.value))} min={1} className="input-base w-32 min-h-[44px]" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-sm text-text-secondary block mb-1">Valid From *</label><input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="input-base w-full min-h-[44px]" /></div>
        <div><label className="text-sm text-text-secondary block mb-1">Valid Until</label><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="input-base w-full min-h-[44px]" /></div>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary w-full min-h-[44px] rounded-full disabled:opacity-50">{submitting ? "Creating..." : "Create Coupon"}</button>
    </form>
  );
}
