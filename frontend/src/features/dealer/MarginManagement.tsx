// Design source: Stitch MCP — Admin Margin Management screen (frosted glass table, no borders)
"use client";

import { useState, useEffect } from "react";
import MarginPreview from "./MarginPreview";
import MarginHistory from "./MarginHistory";
import { getStoredAccessToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface MarginRatio { id: string; state_id: number | null; dealer_pct: number; platform_pct: number; calculation_basis: string; effective_from: string; }

export default function MarginManagement() {
  const [ratios, setRatios] = useState<MarginRatio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [dealerPct, setDealerPct] = useState(70);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/admin/margins`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setRatios)
      .catch(() => setRatios([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/v1/admin/margins`, {
        method: "PUT", headers: getAuthHeaders(),
        body: JSON.stringify({ state_id: selectedState ? Number(selectedState) : null, dealer_pct: dealerPct, platform_pct: 100 - dealerPct, calculation_basis: "net_of_gst", effective_from: effectiveFrom }),
      });
      setShowForm(false);
      const res = await fetch(`${API}/api/v1/admin/margins`, { headers: getAuthHeaders() });
      if (res.ok) setRatios(await res.json());
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Revenue Sharing Configuration</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary px-6 min-h-[44px] rounded-full">{showForm ? "Cancel" : "Configure New Margin"}</button>
      </div>

      {showForm && (
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-medium text-text-primary">Update Margin</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-sm text-text-secondary block mb-1">State</label><select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="input-base w-full min-h-[44px]"><option value="">Global (all states)</option></select></div>
            <div><label className="text-sm text-text-secondary block mb-1">Dealer %</label><input type="number" min={0} max={100} value={dealerPct} onChange={e => setDealerPct(Number(e.target.value))} className="input-base w-full min-h-[44px]" /></div>
            <div><label className="text-sm text-text-secondary block mb-1">Platform %</label><input type="number" value={100 - dealerPct} disabled className="input-base w-full min-h-[44px] opacity-60" /></div>
          </div>
          <div><label className="text-sm text-text-secondary block mb-1">Effective From</label><input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="input-base w-48 min-h-[44px]" /></div>
          <MarginPreview currentDealerPct={ratios.find(r => selectedState ? r.state_id === Number(selectedState) : r.state_id === null)?.dealer_pct} newDealerPct={dealerPct} affectedDealers={ratios.length} effectiveFrom={effectiveFrom} />
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !effectiveFrom} className="btn-primary px-6 min-h-[44px] rounded-full disabled:opacity-50">{saving ? "Saving..." : "Save Configuration"}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary px-6 min-h-[44px] rounded-full">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-surface-sunken rounded-xl" />)}</div> : (
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider"><span>State</span><span>Dealer %</span><span>Platform %</span><span>Basis</span><span>Effective From</span><span>Actions</span></div>
          {ratios.length === 0 ? <p className="text-text-secondary text-center py-8 glass-card rounded-xl">No margin ratios configured.</p> : ratios.map(r => (
            <div key={r.id} className="grid grid-cols-6 gap-4 px-4 py-4 glass-card rounded-xl items-center">
              <span className="text-sm text-text-primary">{r.state_id ? `State #${r.state_id}` : "Global"}</span>
              <span className="text-sm font-medium text-accent-primary">{r.dealer_pct}%</span>
              <span className="text-sm text-text-secondary">{r.platform_pct}%</span>
              <span className="text-sm text-text-secondary capitalize">{r.calculation_basis.replace("_", " ")}</span>
              <span className="text-sm text-text-secondary">{new Date(r.effective_from).toLocaleDateString("en-IN")}</span>
              <button onClick={() => { setDealerPct(r.dealer_pct); setEffectiveFrom(""); setShowForm(true); }} className="text-sm text-accent-primary hover:underline min-h-[44px]">Edit</button>
            </div>
          ))}
        </div>
      )}

      <MarginHistory />
    </div>
  );
}
