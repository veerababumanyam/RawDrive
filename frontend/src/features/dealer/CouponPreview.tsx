// Design source: Stitch MCP — Discount preview card (pill badge, strikethrough, green discount, bold total)
"use client";

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

interface Props { couponCode: string; discountType: "percentage" | "fixed"; discountValue: number; originalAmountPaisa: number; discountedAmountPaisa: number; onRemove: () => void; }

export default function CouponPreview({ couponCode, discountType, discountValue, originalAmountPaisa, discountedAmountPaisa, onRemove }: Props) {
  const discountAmount = originalAmountPaisa - discountedAmountPaisa;
  const discountLabel = discountType === "percentage" ? `${(discountValue / 100).toFixed(1)}% off` : `${formatPaisa(discountValue)} off`;

  return (
    <div className="glass-card p-4 rounded-xl bg-feedback-success/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-accent-primary/20 text-accent-primary text-sm font-mono font-bold">{couponCode}</span>
          <span className="text-xs text-text-tertiary">{discountLabel}</span>
        </div>
        <button onClick={onRemove} className="text-sm text-feedback-error hover:underline min-h-[44px]">Remove</button>
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm text-text-tertiary line-through">{formatPaisa(originalAmountPaisa)}</span>
        <span className="text-sm text-feedback-success font-medium">-{formatPaisa(discountAmount)}</span>
        <span className="text-lg font-bold text-text-primary">{formatPaisa(discountedAmountPaisa)}</span>
      </div>
    </div>
  );
}
