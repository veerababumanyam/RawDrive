"use client";

import { useState, useEffect } from "react";
import { listInvoices, createInvoice, formatPaisa, type Invoice, type InvoiceLineItem } from "@/lib/api/billing";
import { listContacts, type Contact } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { invoiceStatusClasses } from "@/lib/dashboard-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface LineRow {
  description: string;
  quantity: number;
  unit_price_rupees: number;
  hsn_code: string;
  tax_rate: number;
}

const BLANK_LINE: LineRow = {
  description: "",
  quantity: 1,
  unit_price_rupees: 0,
  hsn_code: "998381", // HSN for photographic services (GST)
  tax_rate: 18,
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Create-invoice modal state. A photographer UAT scenario: create
  // a GST-compliant invoice, download the PDF, record a payment,
  // and see the status flip from issued → paid. Backend endpoints
  // (M4 routes_m4.go) already exist; the frontend just never had a
  // create form.
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    contact_id: "",
    invoice_type: "tax_invoice",
    due_date: "",
    notes: "",
    lines: [{ ...BLANK_LINE }] as LineRow[],
  });

  useEffect(() => {
    const token = getStoredAccessToken();
    listInvoices(token)
      .then(setInvoices)
      .catch((err) => { setError(err?.message || "Failed to load invoices"); setInvoices([]); })
      .finally(() => setLoading(false));
  }, [refreshTick]);

  useEffect(() => {
    const token = getStoredAccessToken();
    listContacts(token).then(setContacts).catch(() => setContacts([]));
  }, []);

  const totalRupees = form.lines.reduce((sum, l) => sum + l.quantity * l.unit_price_rupees, 0);
  const taxRupees = form.lines.reduce(
    (sum, l) => sum + (l.quantity * l.unit_price_rupees * l.tax_rate) / 100,
    0,
  );

  const setLine = (idx: number, patch: Partial<LineRow>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const handleCreate = async () => {
    if (!form.contact_id || form.lines.length === 0 || creating) return;
    if (!form.lines[0].description.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const lineItems: InvoiceLineItem[] = form.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price_paisa: Math.round(l.unit_price_rupees * 100),
        hsn_code: l.hsn_code,
        tax_rate: l.tax_rate,
      }));
      // Compute GST totals. The backend persists whatever
      // subtotal/cgst/sgst/igst/total we send (no server-side
      // recomputation), so the frontend must do the math.
      // Default to same-state CGST+SGST split. A proper
      // out-of-state IGST path requires comparing client state
      // against workspace state — flagged as a known UAT gap
      // pending a state-aware tax helper.
      const subtotalPaisa = lineItems.reduce(
        (sum, l) => sum + l.quantity * l.unit_price_paisa,
        0,
      );
      const totalTaxPaisa = lineItems.reduce(
        (sum, l) => sum + Math.round((l.quantity * l.unit_price_paisa * l.tax_rate) / 100),
        0,
      );
      const cgstPaisa = Math.floor(totalTaxPaisa / 2);
      const sgstPaisa = totalTaxPaisa - cgstPaisa;
      const totalPaisa = subtotalPaisa + totalTaxPaisa;

      await createInvoice(token, {
        contact_id: form.contact_id,
        invoice_type: form.invoice_type,
        due_date: form.due_date || undefined,
        line_items: lineItems,
        subtotal_paisa: subtotalPaisa,
        cgst_paisa: cgstPaisa,
        sgst_paisa: sgstPaisa,
        igst_paisa: 0,
        total_paisa: totalPaisa,
        amount_paid_paisa: 0,
      } as Partial<Invoice> & { contact_id: string });
      setShowCreate(false);
      setForm({
        contact_id: "",
        invoice_type: "tax_invoice",
        due_date: "",
        notes: "",
        lines: [{ ...BLANK_LINE }],
      });
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPDF = async (inv: Invoice) => {
    // The /invoices/:id/pdf endpoint streams a PDF byte buffer
    // through the authenticated API. We fetch with the bearer
    // header (plain <a href> would drop the header) and stream
    // the blob into a temporary download anchor.
    const token = getStoredAccessToken();
    try {
      const res = await fetch(`${API_BASE}/api/v1/billing/invoices/${inv.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF");
    }
  };

  const handleRecordPayment = async (inv: Invoice) => {
    const token = getStoredAccessToken();
    const outstanding = inv.total_paisa - inv.amount_paid_paisa;
    const rupees = window.prompt(
      `Record payment for ${inv.invoice_number}\nOutstanding: ₹${(outstanding / 100).toLocaleString("en-IN")}\n\nAmount in rupees:`,
      String(outstanding / 100),
    );
    if (!rupees) return;
    const amountPaisa = Math.round(parseFloat(rupees) * 100);
    if (!amountPaisa || amountPaisa <= 0) {
      setError("Invalid payment amount");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/billing/invoices/${inv.id}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount_paisa: amountPaisa,
          // DB columns are `method` and `reference_number` — caught
          // by UAT 2026-04-12 after the initial draft sent
          // payment_method/reference and the backend discarded
          // them, causing the NOT NULL method column to violate
          // its constraint. Use the schema names directly.
          method: "bank_transfer",
          reference_number: "Recorded via UAT",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Invoices</h1>
          <p className="text-sm text-text-secondary mt-1">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
        >
          + New Invoice
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Invoice</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={form.contact_id}
              onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="">— Select client * —</option>
              {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <select
              value={form.invoice_type}
              onChange={(e) => setForm({ ...form, invoice_type: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="tax_invoice">Tax Invoice</option>
              <option value="proforma">Proforma</option>
              <option value="advance_receipt">Advance Receipt</option>
              <option value="credit_note">Credit Note</option>
            </select>
            <input
              type="date" placeholder="Due date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-secondary">Line items</h3>
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  type="text" placeholder="Description *"
                  value={line.description}
                  onChange={(e) => setLine(idx, { description: e.target.value })}
                  className="col-span-5 rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-sm text-text-primary"
                />
                <input
                  type="number" min="1" placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 1 })}
                  className="col-span-1 rounded-xl border border-border-default bg-surface-sunken px-2 py-2 text-sm text-text-primary text-right"
                />
                <input
                  type="number" min="0" placeholder="₹ Rate"
                  value={line.unit_price_rupees}
                  onChange={(e) => setLine(idx, { unit_price_rupees: Number(e.target.value) || 0 })}
                  className="col-span-2 rounded-xl border border-border-default bg-surface-sunken px-2 py-2 text-sm text-text-primary text-right"
                />
                <input
                  type="text" placeholder="HSN"
                  value={line.hsn_code}
                  onChange={(e) => setLine(idx, { hsn_code: e.target.value })}
                  className="col-span-2 rounded-xl border border-border-default bg-surface-sunken px-2 py-2 text-sm text-text-primary"
                />
                <input
                  type="number" min="0" max="28" placeholder="GST %"
                  value={line.tax_rate}
                  onChange={(e) => setLine(idx, { tax_rate: Number(e.target.value) || 0 })}
                  className="col-span-1 rounded-xl border border-border-default bg-surface-sunken px-2 py-2 text-sm text-text-primary text-right"
                />
                <button
                  onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                  disabled={form.lines.length === 1}
                  className="col-span-1 text-text-tertiary hover:text-error disabled:opacity-30"
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { ...BLANK_LINE }] }))}
              className="text-sm text-accent-primary hover:underline"
            >
              + Add line
            </button>
          </div>

          <div className="rounded-xl border border-border-default bg-surface-sunken px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-text-secondary">Subtotal / GST / Total</span>
            <span className="font-semibold text-text-primary">
              ₹{totalRupees.toLocaleString("en-IN")} + ₹{taxRupees.toLocaleString("en-IN")} = ₹{(totalRupees + taxRupees).toLocaleString("en-IN")}
            </span>
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
              disabled={creating || !form.contact_id || !form.lines[0].description.trim()}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-text-secondary">No invoices yet. Create your first GST-compliant invoice.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-text-primary">{inv.invoice_number}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                    <span className="capitalize">{inv.invoice_type.replace("_", " ")}</span>
                    {inv.due_date && <span>Due: {new Date(inv.due_date).toLocaleDateString("en-IN")}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-text-primary">{formatPaisa(inv.total_paisa)}</p>
                  <span
                    className={cn(
                      "mt-1",
                      invoiceStatusClasses[inv.status] || "status-badge status-badge--neutral",
                    )}
                  >
                    {inv.status.replace("_", " ")}
                  </span>
                </div>
              </div>
              {/* GST breakdown */}
              <div className="mt-2 flex gap-4 text-xs text-text-tertiary">
                <span>Subtotal: {formatPaisa(inv.subtotal_paisa)}</span>
                {inv.cgst_paisa > 0 && <span>CGST: {formatPaisa(inv.cgst_paisa)}</span>}
                {inv.sgst_paisa > 0 && <span>SGST: {formatPaisa(inv.sgst_paisa)}</span>}
                {inv.igst_paisa > 0 && <span>IGST: {formatPaisa(inv.igst_paisa)}</span>}
                {inv.amount_paid_paisa > 0 && (
                  <span className="text-success">Paid: {formatPaisa(inv.amount_paid_paisa)}</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleDownloadPDF(inv)}
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-sunken"
                >
                  Download PDF
                </button>
                {inv.status !== "paid" && (
                  <button
                    onClick={() => handleRecordPayment(inv)}
                    className="rounded-lg bg-success/10 border border-success/30 px-3 py-1.5 text-xs text-success hover:bg-success/20"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
