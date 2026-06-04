"use client";

import Link from "next/link";

interface SalesContinuityPanelProps {
  invoiceId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
  cartCount?: number;
}

export function SalesContinuityPanel({
  invoiceId,
  dealId,
  projectId,
  cartCount = 0,
}: SalesContinuityPanelProps) {
  const invoiceLinked = Boolean(invoiceId);
  const dealLinked = Boolean(dealId);
  const projectLinked = Boolean(projectId);

  return (
    <div
      id="sales"
      className="surface-panel space-y-3 p-5"
      data-testid="sales-continuity-panel"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          Sales continuity
        </h2>
        <span className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
          Linked records
        </span>
      </div>
      <ul className="space-y-1.5 text-xs">
        <li className="flex items-center justify-between">
          <span className="text-text-secondary">Invoice</span>
          {invoiceLinked ? (
            <Link
              href={`/invoices/${invoiceId}`}
              className="font-medium text-accent-primary hover:underline"
              data-testid="sales-invoice-link"
            >
              View invoice →
            </Link>
          ) : (
            <span className="text-text-tertiary">Not linked</span>
          )}
        </li>
        <li className="flex items-center justify-between">
          <span className="text-text-secondary">Deal</span>
          <span
            className={dealLinked ? "text-text-primary" : "text-text-tertiary"}
          >
            {dealLinked ? "Linked" : "Not linked"}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-text-secondary">Project</span>
          <span
            className={
              projectLinked ? "text-text-primary" : "text-text-tertiary"
            }
          >
            {projectLinked ? "Linked" : "Not linked"}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-text-secondary">Gallery cart items</span>
          <span
            className="font-medium text-text-primary"
            data-testid="sales-cart-count"
          >
            {cartCount}
          </span>
        </li>
      </ul>
      <p className="text-[11px] leading-relaxed text-text-tertiary">
        Invoices, deals, and cart activity roll up here so commerce stays in the
        same workspace as the photos.
      </p>
    </div>
  );
}
