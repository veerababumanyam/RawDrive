"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadGSTR1CSV, formatPaisa, getGSTR1Report, type GSTR1Report } from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

function currentFinancialYear(): string {
  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() < 3) year -= 1;
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export default function GSTR1ReportPage() {
  const [fy, setFy] = useState(currentFinancialYear());
  const [report, setReport] = useState<GSTR1Report | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "B2B" | "B2C">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    let ignore = false;
    getGSTR1Report(token, fy)
      .then((data) => {
        if (!ignore) {
          setReport(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load GSTR-1");
          setReport(null);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fy]);

  const entries = useMemo(() => {
    const all = report?.entries || [];
    if (activeTab === "all") return all;
    return all.filter((entry) => entry.supply_type === activeTab);
  }, [activeTab, report]);

  const handleDownload = async () => {
    try {
      const token = getStoredAccessToken();
      const blob = await downloadGSTR1CSV(token, fy);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gstr1-${fy}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download CSV");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">GSTR-1 Export</h1>
          <p className="mt-1 text-sm text-text-secondary">Outward supply data for your CA, grouped by financial year.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Financial year
            <input
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="input-field"
              placeholder="2026-27"
            />
          </label>
          <button
            type="button"
            onClick={handleDownload}
            className="self-end rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            Download CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-32 rounded-2xl bg-surface-sunken animate-pulse" />
      ) : report ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs text-text-tertiary">Taxable value</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{formatPaisa(report.total_taxable_paisa)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs text-text-tertiary">CGST + SGST</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{formatPaisa(report.total_cgst_paisa + report.total_sgst_paisa)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs text-text-tertiary">IGST</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{formatPaisa(report.total_igst_paisa)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs text-text-tertiary">B2B / B2C</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{report.b2b_count} / {report.b2c_count}</p>
            </div>
          </section>

          <div className="flex gap-2">
            {(["all", "B2B", "B2C"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "segmented-control-button text-sm",
                  activeTab === tab ? "segmented-control-button--active" : "segmented-control-button--inactive",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <section className="overflow-hidden rounded-2xl border border-border-default bg-surface-raised">
            {entries.length === 0 ? (
              <div className="p-10 text-center text-sm text-text-secondary">No filing rows for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-surface-sunken text-xs text-text-tertiary">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Supply</th>
                      <th className="px-4 py-3 text-right">Taxable</th>
                      <th className="px-4 py-3 text-right">GST</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={`${entry.invoice_number}-${entry.invoice_date}`} className="border-t border-border-default">
                        <td className="px-4 py-3 font-mono text-xs text-text-primary">
                          {entry.invoice_number}
                          <span className="block pt-1 font-sans text-text-tertiary">{entry.invoice_date}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {entry.client_name || "Client"}
                          {entry.client_gstin ? <span className="block pt-1 text-xs text-text-tertiary">{entry.client_gstin}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {entry.supply_type}
                          <span className="block pt-1 text-xs text-text-tertiary">SAC {entry.sac_code}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary">{formatPaisa(entry.taxable_value_paisa)}</td>
                        <td className="px-4 py-3 text-right text-text-secondary">
                          {formatPaisa(entry.cgst_paisa + entry.sgst_paisa + entry.igst_paisa)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{formatPaisa(entry.total_paisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
