"use client";

import { useState, useEffect } from "react";
import { listInvoices, formatPaisa, type Invoice } from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { invoiceStatusClasses } from "@/lib/dashboard-ui";

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    listInvoices(token)
      .then(setInvoices)
      .catch((err) => { setError(err?.message || "Failed to load invoices"); setInvoices([]); })
      .finally(() => setLoading(false));
  }, []);

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
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-text-secondary">No invoices yet. Create your first GST-compliant invoice.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-text-primary">{inv.invoice_number}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                    <span className="capitalize">{inv.invoice_type}</span>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
