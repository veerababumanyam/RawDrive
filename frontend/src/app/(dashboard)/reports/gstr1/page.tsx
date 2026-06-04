"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadGSTR1CSV,
  formatPaisa,
  getGSTR1Report,
  type GSTR1Report,
} from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { Card } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";

function currentFinancialYear(): string {
  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() < 3) year -= 1;
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

const GSTR_PAGE_SIZE = 25;
const GSTR_TABS = ["all", "B2B", "B2C"] as const;

export default function GSTR1ReportPage() {
  const [fy, setFy] = useState(currentFinancialYear());
  const [report, setReport] = useState<GSTR1Report | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "B2B" | "B2C">("all");
  const [page, setPage] = useState(0);
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
          setError(
            err instanceof Error ? err.message : "Failed to load GSTR-1",
          );
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

  const pageCount = Math.ceil(entries.length / GSTR_PAGE_SIZE);
  const pageEntries = entries.slice(
    page * GSTR_PAGE_SIZE,
    (page + 1) * GSTR_PAGE_SIZE,
  );

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
    <PageContainer width="wide">
      <CRMSecondaryNav />

      <PageHeader
        title="GSTR-1 Export"
        description="Outward supply data for your CA, grouped by financial year."
        actions={
          <>
            <label className="gstr-year-field">
              <span className="form-label">Financial year</span>
              <input
                value={fy}
                onChange={(e) => {
                  setFy(e.target.value);
                  setPage(0);
                }}
                className="input-base gstr-year-input"
                placeholder="2026-27"
              />
            </label>
            <GlassButton
              type="button"
              variant="primary"
              size="md"
              className="gstr-download-button"
              onClick={handleDownload}
            >
              Download CSV
            </GlassButton>
          </>
        }
      />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {loading ? (
        <Card
          variant="panel"
          padding="none"
          className="gstr-report-skeleton"
          aria-label="Loading GSTR-1 report"
        />
      ) : report ? (
        <>
          <section className="gstr-summary-grid" aria-label="GSTR-1 summary">
            <Card variant="panel" padding="none" className="gstr-metric-card">
              <p className="gstr-metric-card__label">Taxable value</p>
              <p className="gstr-metric-card__value">
                {formatPaisa(report.total_taxable_paisa)}
              </p>
            </Card>
            <Card variant="panel" padding="none" className="gstr-metric-card">
              <p className="gstr-metric-card__label">CGST + SGST</p>
              <p className="gstr-metric-card__value">
                {formatPaisa(report.total_cgst_paisa + report.total_sgst_paisa)}
              </p>
            </Card>
            <Card variant="panel" padding="none" className="gstr-metric-card">
              <p className="gstr-metric-card__label">IGST</p>
              <p className="gstr-metric-card__value">
                {formatPaisa(report.total_igst_paisa)}
              </p>
            </Card>
            <Card variant="panel" padding="none" className="gstr-metric-card">
              <p className="gstr-metric-card__label">B2B / B2C</p>
              <p className="gstr-metric-card__value">
                {report.b2b_count} / {report.b2c_count}
              </p>
            </Card>
          </section>

          <div
            role="tablist"
            aria-label="Supply type"
            className="glass-segmented gstr-filter-tabs"
          >
            {GSTR_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                  setPage(0);
                }}
                className="glass-segmented-option"
              >
                {tab === "all" ? "All" : tab}
              </button>
            ))}
          </div>

          <Card variant="panel" padding="none" className="gstr-table-panel">
            {entries.length === 0 ? (
              <div className="gstr-empty-state">
                No filing rows for this period.
              </div>
            ) : (
              <>
                <div className="gstr-table-scroll">
                  <table className="gstr-table">
                    <thead className="gstr-table__head">
                      <tr>
                        <th className="gstr-table__heading">Invoice</th>
                        <th className="gstr-table__heading">Client</th>
                        <th className="gstr-table__heading">Supply</th>
                        <th className="gstr-table__heading gstr-table__heading--numeric">
                          Taxable
                        </th>
                        <th className="gstr-table__heading gstr-table__heading--numeric">
                          GST
                        </th>
                        <th className="gstr-table__heading gstr-table__heading--numeric">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((entry) => (
                        <tr
                          key={`${entry.invoice_number}-${entry.invoice_date}`}
                          className="gstr-table__row"
                        >
                          <td className="gstr-table__cell gstr-table__cell--mono">
                            {entry.invoice_number}
                            <span className="gstr-table__secondary">
                              {entry.invoice_date}
                            </span>
                          </td>
                          <td className="gstr-table__cell">
                            {entry.client_name || "Client"}
                            {entry.client_gstin ? (
                              <span className="gstr-table__secondary">
                                {entry.client_gstin}
                              </span>
                            ) : null}
                          </td>
                          <td className="gstr-table__cell">
                            {entry.supply_type}
                            <span className="gstr-table__secondary">
                              SAC {entry.sac_code}
                            </span>
                          </td>
                          <td className="gstr-table__cell gstr-table__cell--numeric">
                            {formatPaisa(entry.taxable_value_paisa)}
                          </td>
                          <td className="gstr-table__cell gstr-table__cell--numeric">
                            {formatPaisa(
                              entry.cgst_paisa +
                                entry.sgst_paisa +
                                entry.igst_paisa,
                            )}
                          </td>
                          <td className="gstr-table__cell gstr-table__cell--numeric gstr-table__cell--strong">
                            {formatPaisa(entry.total_paisa)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pageCount > 1 && (
                  <div className="gstr-pagination">
                    <span className="gstr-pagination__status">
                      Page {page + 1} of {pageCount} ({entries.length} entries)
                    </span>
                    <div className="gstr-pagination__actions">
                      <GlassButton
                        type="button"
                        variant="surface"
                        size="md"
                        onClick={() => setPage((p) => p - 1)}
                        disabled={page === 0}
                      >
                        Previous
                      </GlassButton>
                      <GlassButton
                        type="button"
                        variant="surface"
                        size="md"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= pageCount - 1}
                      >
                        Next
                      </GlassButton>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      ) : null}
    </PageContainer>
  );
}
