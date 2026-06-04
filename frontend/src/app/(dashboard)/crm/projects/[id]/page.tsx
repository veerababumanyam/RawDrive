"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState, type ReactNode } from "react";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import {
  CalendarDays,
  FileSignature,
  Photo,
  ReceiptText,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getProject, type StudioProjectAggregate } from "@/lib/api/crm";
import { formatPaisa } from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_CLASS,
  getProjectStatusLabel,
} from "@/lib/crm-taxonomy";

function formatDate(value?: string) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="glass-button glass-button--surface glass-button--sm"
    >
      <span className="glass-button__icon">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function ProjectStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="panel" padding="sm" className="crm-stat-card">
      <span className="crm-stat-card__label">{label}</span>
      <span className="crm-stat-card__value">{value}</span>
    </Card>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [token] = useState(() => getStoredAccessToken());
  const [aggregate, setAggregate] = useState<StudioProjectAggregate | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(
    token ? null : "Missing access token",
  );

  useEffect(() => {
    if (!token) return;
    getProject(token, id)
      .then((data) => {
        setAggregate(data);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load project"),
      )
      .finally(() => setLoading(false));
  }, [id, token]);

  const project = aggregate?.project;
  const paid = useMemo(
    () =>
      aggregate?.payments.reduce(
        (sum, payment) => sum + payment.amount_paisa,
        0,
      ) ?? 0,
    [aggregate],
  );

  return (
    <PageContainer width="wide">
      <CRMSecondaryNav />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {loading ? (
        <div className="space-y-3">
          <Card
            variant="panel"
            padding="none"
            className="crm-overview-skeleton"
            aria-hidden="true"
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <Card
                key={item}
                variant="panel"
                padding="none"
                className="crm-overview-skeleton"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      ) : !aggregate || !project ? (
        <Card variant="panel" padding="lg" className="text-center">
          <p className="font-medium text-text-primary">
            Project could not be loaded
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Check the project link or return to the project board.
          </p>
          <Link
            href="/crm/projects"
            className="glass-button glass-button--surface glass-button--md mt-4"
          >
            <span>Open Project Board</span>
          </Link>
        </Card>
      ) : (
        <>
          <PageHeader
            backHref="/crm/projects"
            backLabel="Back to projects"
            eyebrow="Studio Project"
            title={project.name}
            description={[
              aggregate.contact?.name,
              project.project_type?.replaceAll("_", " "),
              formatDate(project.event_date),
              project.venue_name,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              <>
                <span
                  className={cn(
                    PROJECT_STATUS_CLASS[project.status] ||
                      "status-badge status-badge--neutral",
                  )}
                >
                  {getProjectStatusLabel(project.status)}
                </span>
                <ActionLink
                  href={`/calendar?create=true&client=${project.contact_id}&project=${project.id}`}
                  icon={<CalendarDays aria-hidden="true" />}
                >
                  Create Booking
                </ActionLink>
                <ActionLink
                  href={`/crm/documents?project=${project.id}`}
                  icon={<FileSignature aria-hidden="true" />}
                >
                  Create Contract
                </ActionLink>
                <ActionLink
                  href={`/billing?create=true&client=${project.contact_id}&project=${project.id}`}
                  icon={<ReceiptText aria-hidden="true" />}
                >
                  Create Invoice
                </ActionLink>
                <ActionLink
                  href={`/galleries?create=true&client=${project.contact_id}&project=${project.id}`}
                  icon={<Photo aria-hidden="true" />}
                >
                  Link Gallery
                </ActionLink>
              </>
            }
          />

          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ProjectStatCard
              label="Expected value"
              value={formatPaisa(project.expected_value_paisa || 0)}
            />
            <ProjectStatCard
              label="Booked value"
              value={formatPaisa(project.booked_value_paisa || 0)}
            />
            <ProjectStatCard label="Paid" value={formatPaisa(paid)} />
            <ProjectStatCard
              label="Balance due"
              value={formatPaisa(project.balance_due_paisa || 0)}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card variant="panel" padding="md" className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Lifecycle Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aggregate.timeline.map((entry) => (
                  <div
                    key={`${entry.type}-${entry.timestamp}-${entry.title}`}
                    className="crm-overview-list-link crm-overview-list-link--stacked"
                  >
                    <span className="crm-overview-list-link__title">
                      {entry.title}
                    </span>
                    <span className="crm-overview-list-link__meta">
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </div>
                ))}
                {aggregate.timeline.length === 0 && (
                  <p className="crm-empty-copy">No project timeline yet.</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card variant="panel" padding="md">
                <CardHeader>
                  <CardTitle>Next Action</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">
                    {project.next_action || "No next action set."}
                  </p>
                </CardContent>
              </Card>

              <Card variant="panel" padding="md">
                <CardHeader>
                  <CardTitle>Client</CardTitle>
                </CardHeader>
                <CardContent>
                  {aggregate.contact ? (
                    <Link
                      href={`/crm/contacts/${aggregate.contact.id}`}
                      className="text-sm font-medium text-accent-primary hover:underline"
                    >
                      {aggregate.contact.name}
                    </Link>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      No client loaded.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LinkedList
              title="Bookings"
              empty="No bookings linked yet."
              items={aggregate.bookings.map(
                (booking) =>
                  `${booking.title} · ${formatDateTime(booking.start_at)}`,
              )}
            />
            <LinkedList
              title="Documents"
              empty="No contracts linked yet."
              items={aggregate.contracts.map(
                (contract) => `${contract.title} · ${contract.status}`,
              )}
            />
            <LinkedList
              title="Billing"
              empty="No invoices linked yet."
              items={aggregate.invoices.map(
                (invoice) =>
                  `${invoice.invoice_number} · ${formatPaisa(invoice.total_paisa)} · ${invoice.status}`,
              )}
            />
            <LinkedList
              title="Galleries"
              empty="No galleries linked yet."
              items={aggregate.galleries.map(
                (gallery) =>
                  `${gallery.title} · ${gallery.status} · ${gallery.photo_count} photos`,
              )}
            />
          </section>
        </>
      )}
    </PageContainer>
  );
}

function LinkedList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <Card variant="panel" padding="md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className="crm-overview-list-link crm-overview-list-link--stacked"
          >
            <span className="crm-overview-list-link__title">{item}</span>
          </div>
        ))}
        {items.length === 0 && <p className="crm-empty-copy">{empty}</p>}
      </CardContent>
    </Card>
  );
}
