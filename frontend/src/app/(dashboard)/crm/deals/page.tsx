"use client";

import { useState, useEffect } from "react";
import { listDeals, listContacts, type Deal, type Contact } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const DEAL_STAGES = ["inquiry", "proposal", "negotiation", "booked", "delivered", "lost"];

const stageClass: Record<string, string> = {
  inquiry: "status-badge status-badge--neutral",
  proposal: "status-badge status-badge--info",
  negotiation: "status-badge status-badge--warning",
  booked: "status-badge status-badge--success",
  delivered: "status-badge status-badge--accent",
  lost: "status-badge status-badge--error",
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    contact_id: "",
    title: "",
    stage: "inquiry",
    amount_rupees: 0,
    advance_rupees: 0,
    event_type: "wedding",
    event_date: "",
    venue: "",
    notes: "",
  });

  useEffect(() => {
    const token = getStoredAccessToken();
    listDeals(token)
      .then((data) => setDeals(data ?? []))
      .catch((err) => { setError(err?.message || "Failed to load deals"); setDeals([]); })
      .finally(() => setLoading(false));
  }, [refreshTick]);

  useEffect(() => {
    const token = getStoredAccessToken();
    listContacts(token).then(setContacts).catch(() => setContacts([]));
  }, []);

  const handleCreate = async () => {
    if (!form.contact_id || !form.title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const body = {
        contact_id: form.contact_id,
        title: form.title.trim(),
        stage: form.stage,
        amount_paisa: Math.round(form.amount_rupees * 100),
        advance_paisa: Math.round(form.advance_rupees * 100),
        event_type: form.event_type || null,
        event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
        venue: form.venue || null,
        notes: form.notes || null,
      };
      const res = await fetch(`${API_BASE}/api/v1/crm/deals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setForm({
        contact_id: "", title: "", stage: "inquiry",
        amount_rupees: 0, advance_rupees: 0,
        event_type: "wedding", event_date: "", venue: "", notes: "",
      });
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setCreating(false);
    }
  };

  /**
   * Schedule a shoot on the calendar for an existing deal. Creates
   * a calendar_events row with event_type=shoot, contact_id + deal_id
   * FK set from the deal, defaulting to the deal's event_date at 09:00
   * → 18:00 (whole-day wedding shoot). This is the CRM → Calendar
   * booking link the user called out — once a deal is won, one click
   * blocks the photographer's calendar for that day.
   */
  const handleBookCalendar = async (deal: Deal) => {
    if (!deal.event_date) {
      setError("Deal has no event_date — edit the deal first.");
      return;
    }
    const token = getStoredAccessToken();
    const start = new Date(deal.event_date);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(18, 0, 0, 0);
    try {
      const res = await fetch(`${API_BASE}/api/v1/calendar/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: deal.title,
          event_type: "shoot",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          contact_id: deal.contact_id,
          deal_id: deal.id,
          notes: deal.venue ? `Venue: ${deal.venue}` : undefined,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      window.alert(`Calendar booked for ${deal.title} on ${start.toLocaleDateString("en-IN")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book calendar event");
    }
  };

  /**
   * Generate an invoice from the deal. Prefills the contact_id and
   * a single line item for the deal amount at 18% GST.
   */
  const handleGenerateInvoice = async (deal: Deal) => {
    const token = getStoredAccessToken();
    const amountPaisa = deal.amount_paisa;
    const taxPaisa = Math.round(amountPaisa * 0.18);
    const cgst = Math.floor(taxPaisa / 2);
    const sgst = taxPaisa - cgst;
    try {
      const res = await fetch(`${API_BASE}/api/v1/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contact_id: deal.contact_id,
          invoice_type: "tax_invoice",
          line_items: [{
            description: deal.title + (deal.event_date ? ` — ${new Date(deal.event_date).toLocaleDateString("en-IN")}` : ""),
            quantity: 1,
            unit_price_paisa: amountPaisa,
            hsn_code: "998381",
            tax_rate: 18,
          }],
          subtotal_paisa: amountPaisa,
          cgst_paisa: cgst,
          sgst_paisa: sgst,
          igst_paisa: 0,
          total_paisa: amountPaisa + taxPaisa,
          amount_paid_paisa: 0,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      window.alert(`Invoice generated. Open Invoices page to view.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalValue = deals.reduce((sum, d) => sum + (d.amount_paisa || 0), 0);
  const wonValue = deals.filter((d) => d.stage === "booked" || d.stage === "delivered")
    .reduce((sum, d) => sum + (d.amount_paisa || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Deals</h1>
          <p className="text-sm text-text-secondary mt-1">
            {deals.length} {deals.length === 1 ? "deal" : "deals"}
            {deals.length > 0 && (
              <span className="ml-3">
                · Pipeline value: ₹{(totalValue / 100).toLocaleString("en-IN")}
                {wonValue > 0 && (
                  <span className="ml-2 text-success">· Won: ₹{(wonValue / 100).toLocaleString("en-IN")}</span>
                )}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
        >
          + New Deal
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Deal</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={form.contact_id}
              onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="">— Select client * —</option>
              {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <input
              type="text" placeholder="Title (e.g. Sharma Wedding) *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              autoFocus
            />
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary capitalize"
            >
              {DEAL_STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="wedding">Wedding</option>
              <option value="portrait">Portrait</option>
              <option value="event">Corporate event</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Total amount (₹)
              <input
                type="number" min="0"
                value={form.amount_rupees}
                onChange={(e) => setForm({ ...form, amount_rupees: Number(e.target.value) || 0 })}
                className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Advance received (₹)
              <input
                type="number" min="0"
                value={form.advance_rupees}
                onChange={(e) => setForm({ ...form, advance_rupees: Number(e.target.value) || 0 })}
                className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Event date
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              />
            </label>
            <input
              type="text" placeholder="Venue"
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            />
            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="sm:col-span-2 rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary resize-y min-h-[80px]"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.contact_id || !form.title.trim()}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Create Deal"}
            </button>
          </div>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
          <p className="text-text-primary font-medium">No deals yet</p>
          <p className="text-sm text-text-secondary mt-1">
            Turn inquiries into signed bookings. Each deal can be scheduled on the calendar
            and converted to an invoice in one click.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + Create your first deal
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map((deal) => (
            <div
              key={deal.id}
              className="bg-surface-raised rounded-xl p-4 border border-border-default"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-text-primary">{deal.title}</p>
                    <span className={cn("capitalize", stageClass[deal.stage] || "status-badge status-badge--neutral")}>
                      {deal.stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                    {deal.event_type && <span className="capitalize">{deal.event_type}</span>}
                    {deal.event_date && (
                      <span>
                        {new Date(deal.event_date).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    )}
                    {deal.venue && <span>{deal.venue}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-text-primary">
                    ₹{((deal.amount_paisa || 0) / 100).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleBookCalendar(deal)}
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-sunken"
                >
                  Book on calendar
                </button>
                <button
                  onClick={() => handleGenerateInvoice(deal)}
                  className="rounded-lg bg-accent-primary/10 border border-accent-primary/30 px-3 py-1.5 text-xs text-accent-primary hover:bg-accent-primary/20"
                >
                  Generate invoice
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
