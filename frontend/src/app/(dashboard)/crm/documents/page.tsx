"use client";
import Link from "next/link";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
export default function CRMDocumentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {" "}
      <CRMSecondaryNav />{" "}
      <div className="rounded-2xl border border-border-default bg-surface-raised p-6">
        {" "}
        <p className="text-sm font-medium text-accent-primary">
          Studio CRM
        </p>{" "}
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">
          Documents
        </h1>{" "}
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          {" "}
          Contracts and proposals are part of the Studio CRM lifecycle. Backend
          contract APIs already exist; the full dashboard document workbench is
          planned for M27.{" "}
        </p>{" "}
        <div className="mt-5 flex flex-wrap gap-2">
          {" "}
          <Link
            href="/crm/projects"
            className="inline-flex touch-min items-center rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken"
          >
            {" "}
            Open Projects{" "}
          </Link>{" "}
          <Link
            href="/billing"
            className="inline-flex touch-min items-center rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken"
          >
            {" "}
            Open Billing{" "}
          </Link>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
