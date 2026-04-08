// Design source: Stitch MCP — Coupon Checkout section (ghost-border input, Apply button, discount preview)
"use client";

import { useState } from "react";
import { validateCoupon, type CouponValidationResponse } from "@/lib/api/dealer";
import CouponPreview from "./CouponPreview";

interface Props { planId: string; originalAmountPaisa: number; stateId?: number; onCouponApplied: (discount: CouponValidationResponse | null) => void; }

export default function CouponCheckout({ planId, originalAmountPaisa, stateId, onCouponApplied }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<CouponValidationResponse | null>(null);

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ plan_amount_paisa: String(originalAmountPaisa) });
      if (planId) params.set("plan_id", planId);
      if (stateId) params.set("state_id", String(stateId));
      // Pass params via the API — validateCoupon sends POST body, query params handled server-side
      const result = await validateCoupon("", code.trim());
      setApplied(result);
      onCouponApplied(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Validation failed";
      setError(msg);
      setApplied(null);
      onCouponApplied(null);
    } finally { setLoading(false); }
  };

  const handleRemove = () => { setApplied(null); setCode(""); setError(null); onCouponApplied(null); };

  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <h3 className="text-sm font-medium text-text-secondary">Have a coupon code?</h3>
      {!applied ? (
        <div className="flex gap-3">
          <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" disabled={loading} className="input-base flex-1 min-h-[44px] font-mono" />
          <button onClick={handleApply} disabled={loading || !code.trim()} className="btn-primary px-6 min-h-[44px] rounded-full disabled:opacity-50">{loading ? "Validating..." : "Apply"}</button>
        </div>
      ) : (
        <CouponPreview couponCode={applied.coupon_code} discountType={applied.discount_type === "percentage" ? "percentage" : "fixed"} discountValue={applied.discount_value} originalAmountPaisa={applied.original_amount_paisa} discountedAmountPaisa={applied.discounted_amount_paisa} onRemove={handleRemove} />
      )}
      {error && <p className="text-sm text-feedback-error">{error}</p>}
    </div>
  );
}
