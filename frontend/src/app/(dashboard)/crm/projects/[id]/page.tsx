"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { BackButton } from "@/components/ui/back-button";
import { getProject, type StudioProjectAggregate } from "@/lib/api/crm";
import { formatPaisa } from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_CLASS, getProjectStatusLabel } from "@/lib/crm-taxonomy";

function formatDate(value?: string) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="surface-button text-sm font-medium"
    >
      {children}
    </Link>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token] = useState(() => getStoredAccessToken());
  const [aggregate, setAggregate] = useState<StudioProjectAggregate | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(token ? null : "Missing access token");

  useEffect(() => {
    if (!token) return;
    getProject(token, id)
      .then((data) => {
        setAggregate(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load project"))
      .finally(() => setLoading(false));
  }, [id, token]);

  const project = aggregate?.project;
  const paid = useMemo(() => aggregate?.payments.reduce((sum, payment) => sum + payment.amount_paisa, 0) ?? 0, [aggregate]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <CRMSecondaryNav />
      <BackButton href="/crm/projects" label="Back to projects" />

      {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-surface-sunken" />)}
          </div>
        </div>
      ) : !project ? (
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
          <p className="font-medium text-text-primary">Project could not be loaded</p>
          <p className="mt-1 text-sm text-text-secondary">Check the project link or return to the project board.</p>
          <Link href="/crm/projects" className="surface-button mt-4 text-sm font-medium">Open Project Board</Link>
        </div>
      ) : (
        <>
          <section className="rounded-3xl border border-border-default bg-surface-raised p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-accent-primary">Studio Project</p>
                  <span className={cn(PROJECT_STATUS_CLASS[project.status] || "status-badge status-badge--neutral")}>{getProjectStatusLabel(project.status)}</span>
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{project.name}</h1>
                <p className="mt-2 text-sm text-text-secondary">
                  {[aggregate.contact?.name, project.project_type?.replaceAll("_", " "), formatDate(project.event_date), project.venue_name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionLink href={`/calendar?create=true&client=${project.contact_id}&project=${project.id}`}>Create Booking</ActionLink>
                <ActionLink href={`/crm/documents?project=${project.id}`}>Create Contract</ActionLink>
                <ActionLink href={`/billing?create=true&client=${project.contact_id}&project=${project.id}`}>Create Invoice</ActionLink>
                <ActionLink href={`/galleries?create=true&client=${project.contact_id}&project=${project.id}`}>Link Gallery</ActionLink>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Expected value</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{formatPaisa(project.expected_value_paisa || 0)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Booked value</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{formatPaisa(project.booked_value_paisa || 0)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Paid</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{formatPaisa(paid)}</p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Balance due</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{formatPaisa(project.balance_due_paisa || 0)}</p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-border-default bg-surface-raised p-5 xl:col-span-2">
              <h2 className="text-lg font-semibold text-text-primary">Lifecycle Timeline</h2>
              <div className="mt-4 space-y-3">
                {aggregate.timeline.map((entry) => (
                  <div key={`${entry.type}-${entry.timestamp}-${entry.title}`} className="rounded-xl border border-border-default px-4 py-3">
                    <p className="font-medium text-text-primary">{entry.title}</p>
                    <p className="mt-1 text-xs text-text-tertiary">{formatDateTime(entry.timestamp)}</p>
                  </div>
                ))}
                {aggregate.timeline.length === 0 && <p className="text-sm text-text-secondary">No project timeline yet.</p>}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border-default bg-surface-raised p-5">
                <h2 className="text-lg font-semibold text-text-primary">Next Action</h2>
                <p className="mt-2 text-sm text-text-secondary">{project.next_action || "No next action set."}</p>
              </div>
              <div className="rounded-2xl border border-border-default bg-surface-raised p-5">
                <h2 className="text-lg font-semibold text-text-primary">Client</h2>
                {aggregate.contact ? (
                  <Link href={`/crm/contacts/${aggregate.contact.id}`} className="mt-2 block text-sm font-medium text-accent-primary hover:underline">
                    {aggregate.contact.name}
                  </Link>
                ) : <p className="mt-2 text-sm text-text-secondary">No client loaded.</p>}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LinkedList title="Bookings" empty="No bookings linked yet." items={aggregate.bookings.map((booking) => `${booking.title} · ${formatDateTime(booking.start_at)}`)} />
            <LinkedList title="Documents" empty="No contracts linked yet." items={aggregate.contracts.map((contract) => `${contract.title} · ${contract.status}`)} />
            <LinkedList title="Billing" empty="No invoices linked yet." items={aggregate.invoices.map((invoice) => `${invoice.invoice_number} · ${formatPaisa(invoice.total_paisa)} · ${invoice.status}`)} />
            <LinkedList title="Galleries" empty="No galleries linked yet." items={aggregate.galleries.map((gallery) => `${gallery.title} · ${gallery.status} · ${gallery.photo_count} photos`)} />
          </section>
        </>
      )}
    </div>
  );
}

function LinkedList({ title, empty, items }: { title: string; empty: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border-default bg-surface-raised p-5">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border-default px-4 py-3 text-sm text-text-primary">{item}</div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-secondary">{empty}</p>}
      </div>
    </div>
  );
}
