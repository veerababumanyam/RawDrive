// Design source: Stitch MCP — Bulk Generate tab (pattern input + live preview + count)
"use client";

import { useState, useMemo } from "react";

interface Props {
  onGenerate: (data: {
    pattern: string;
    count: number;
    coupon_type: string;
    discount_value: number;
    valid_from: string;
  }) => Promise<{ generated_count: number; codes: string[] }>;
}

function generateSample(pattern: string): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return pattern.replace(/X/g, () => charset[Math.floor(Math.random() * charset.length)]);
}

export default function BulkCouponGenerator({ onGenerate }: Props) {
  const [pattern, setPattern] = useState("DEAL-XXXXX");
  const [count, setCount] = useState(10);
  const [couponType, setCouponType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState(1500);
  const [validFrom, setValidFrom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ generated_count: number; codes: string[] } | null>(null);

  const samples = useMemo(
    () => (pattern.includes("X") ? [generateSample(pattern), generateSample(pattern), generateSample(pattern)] : []),
    [pattern],
  );

  const handleGenerate = async () => {
    if (!pattern.includes("X")) return;
    setGenerating(true);
    try {
      const response = await onGenerate({
        pattern,
        count,
        coupon_type: couponType,
        discount_value: discountValue,
        valid_from: validFrom,
      });
      setResult(response);
    } catch {
      setResult(null);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="glass-card p-6 space-y-4 max-w-lg">
      <h3 className="text-lg font-medium text-text-primary">Bulk Generate Coupons</h3>
      <div>
        <label className="text-sm text-text-secondary block mb-1">Pattern (use X for random chars)</label>
        <input type="text" value={pattern} onChange={e => setPattern(e.target.value.toUpperCase())} className="input-base w-full min-h-[44px] font-mono" placeholder="DEAL-XXXXX" />
        {samples.length > 0 && <div className="mt-2 flex gap-2">{samples.map((sample, index) => <span key={index} className="px-2 py-1 bg-surface-sunken rounded text-xs font-mono text-text-secondary">{sample}</span>)}</div>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-sm text-text-secondary block mb-1">Count (1-500)</label><input type="number" value={count} onChange={e => setCount(Math.min(500, Math.max(1, Number(e.target.value))))} min={1} max={500} className="input-base w-full min-h-[44px]" /></div>
        <div><label className="text-sm text-text-secondary block mb-1">Type</label><select value={couponType} onChange={e => setCouponType(e.target.value)} className="input-base w-full min-h-[44px]"><option value="percentage">Percentage</option><option value="fixed_amount">Fixed Amount</option></select></div>
      </div>
      <div><label className="text-sm text-text-secondary block mb-1">Discount Value</label><input type="number" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} min={1} className="input-base w-full min-h-[44px]" /></div>
      <div><label className="text-sm text-text-secondary block mb-1">Valid From</label><input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="input-base w-full min-h-[44px]" /></div>
      <button onClick={handleGenerate} disabled={generating || !pattern.includes("X") || !validFrom} className="btn-primary w-full min-h-[44px] rounded-full disabled:opacity-50">{generating ? "Generating..." : `Generate ${count} Coupons`}</button>
      {result && (
        <div className="glass-card p-4 rounded-xl bg-surface-container space-y-2">
          <p className="text-sm text-accent-primary font-medium">{result.generated_count} coupons generated</p>
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">{result.codes.map(code => <span key={code} className="px-2 py-0.5 bg-surface-sunken rounded text-xs font-mono text-text-primary">{code}</span>)}</div>
          <button onClick={() => navigator.clipboard.writeText(result.codes.join("\n"))} className="text-sm text-accent-secondary hover:underline min-h-[44px]">Copy All</button>
        </div>
      )}
    </div>
  );
}
