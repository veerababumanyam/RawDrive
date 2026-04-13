"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { listEvents, type CalendarEvent } from "@/lib/api/calendar";
import { listInvoices, formatPaisa, type Invoice } from "@/lib/api/billing";
import { listGalleries, type Gallery } from "@/lib/api/galleries";
import { listLeads, listProjects, type Lead, type StudioProject } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";

interface OverviewState {
  leads: Lead[];
  projects: StudioProject[];
  invoices: Invoice[];
  events: CalendarEvent[];
  galleries: Gallery[];
  error: string | null;
}

const initialState: OverviewState = {
  leads: [],
  projects: [],
  invoices: [],
  events: [],
  galleries: [],
  error: null,
};

function isOpenInquiry(lead: Lead) {
  return lead.stage !== "won" && lead.stage !== "lost";
}

function isOverdueInvoice(invoice: Invoice) {
  const outstanding = invoice.total_paisa - invoice.amount_paid_paisa;
  if (outstanding <= 0 || invoice.status === "paid") return false;
  if (invoice.status === "overdue") return true;
  return Boolean(invoice.due_date && new Date(invoice.due_date).getTime() < Date.now());
}

function StatCard({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-border-default bg-surface-raised p-4 transition-colors hover:bg-surface-sunken">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-secondary">{detail}</p>
    </Link>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken"
    >
      {children}
    </Link>
  );
}

export default function CRMPage() {
  const [token] = useState(() => getStoredAccessToken());
  const [state, setState] = useState<OverviewState>(() =>
    token ? initialState : { ...initialState, error: "Missing access token" },
  );
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

    Promise.allSettled([
      listLeads(token),
      listProjects(token),
      listInvoices(token),
      listEvents(token, from.toISOString(), to.toISOString()),
      listGalleries(token),
    ]).then((results) => {
      if (ignore) return;
      const [leads, projects, invoices, events, galleries] = results;
      const failed = results.find((result) => result.status === "rejected");
      setState({
        leads: leads.status === "fulfilled" ? leads.value : [],
        projects: projects.status === "fulfilled" ? projects.value : [],
        invoices: invoices.status === "fulfilled" ? invoices.value : [],
        events: events.status === "fulfilled" ? events.value : [],
        galleries: galleries.status === "fulfilled" ? galleries.value : [],
        error: failed?.status === "rejected" ? failed.reason?.message || "Some CRM data could not be loaded" : null,
      });
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [token]);

  const summary = useMemo(() => {
    const hotInquiries = state.leads.filter(isOpenInquiry);
    const upcomingShoots = state.events.filter((event) => event.event_type === "shoot" && event.status !== "cancelled");
    const overdueInvoices = state.invoices.filter(isOverdueInvoice);
    const bookedValue = state.projects
      .filter((project) => ["booked", "shooting", "editing", "proofing", "delivered"].includes(project.status))
      .reduce((sum, project) => sum + (project.booked_value_paisa || project.expected_value_paisa || 0), 0);
    const outstanding = state.invoices.reduce(
      (sum, invoice) => sum + Math.max(0, invoice.total_paisa - invoice.amount_paid_paisa),
      0,
    );
    const taxCollected = state.invoices.reduce(
      (sum, invoice) => sum + invoice.cgst_paisa + invoice.sgst_paisa + invoice.igst_paisa,
      0,
    );

    return { hotInquiries, upcomingShoots, overdueInvoices, bookedValue, outstanding, taxCollected };
  }, [state]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <CRMSecondaryNav />

      {state.error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-accent-primary">Studio CRM</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">Studio CRM</h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Today in your studio: inquiries, projects, bookings, billing, delivery, and tax in one operating view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionLink href="/crm/inquiries">New Inquiry</ActionLink>
          <ActionLink href="/crm/projects?create=true">New Project</ActionLink>
          <ActionLink href="/calendar?create=true">Book Shoot</ActionLink>
          <ActionLink href="/billing?create=true">Create Invoice</ActionLink>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-2xl bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Hot inquiries" value={String(summary.hotInquiries.length)} detail="Open leads needing conversion" href="/crm/inquiries" />
            <StatCard label="Upcoming shoots" value={String(summary.upcomingShoots.length)} detail="Next 30 days on calendar" href="/calendar" />
            <StatCard label="Pending contracts" value="0" detail="Documents workspace lands next" href="/crm/documents" />
            <StatCard label="Overdue invoices" value={String(summary.overdueInvoices.length)} detail={`${formatPaisa(summary.outstanding)} outstanding`} href="/billing" />
            <StatCard label="Active galleries" value={String(state.galleries.length)} detail="Delivery and proofing work" href="/galleries" />
            <StatCard label="Booked value" value={formatPaisa(summary.bookedValue)} detail="Booked and delivered projects" href="/crm/projects" />
            <StatCard label="GST tracked" value={formatPaisa(summary.taxCollected)} detail="From listed invoices" href="/reports/gstr1" />
            <StatCard label="Price book" value="Open" detail="Packages that feed quotes and invoices" href="/settings/packages" />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-border-default bg-surface-raised p-5 xl:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Project pipeline</h2>
                  <p className="mt-1 text-sm text-text-secondary">Projects are the shared job record for bookings, billing, documents, and galleries.</p>
                </div>
                <Link href="/crm/projects" className="text-sm font-medium text-accent-primary hover:underline">Open Projects</Link>
              </div>
              <div className="mt-4 space-y-2">
                {state.projects.slice(0, 5).map((project) => (
                  <Link key={project.id} href={`/crm/projects/${project.id}`} className="flex items-center justify-between rounded-xl border border-border-default px-4 py-3 hover:bg-surface-sunken">
                    <span className="font-medium text-text-primary">{project.name}</span>
                    <span className="text-sm text-text-secondary">{formatPaisa(project.expected_value_paisa || 0)}</span>
                  </Link>
                ))}
                {state.projects.length === 0 && <p className="text-sm text-text-secondary">No projects yet. Convert an inquiry or create a project.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-border-default bg-surface-raised p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Follow-up queue</h2>
                  <p className="mt-1 text-sm text-text-secondary">M25 surfaces the queue; M28 adds cross-entity automation.</p>
                </div>
                <Link href="/crm/inquiries" className="text-sm font-medium text-accent-primary hover:underline">Review</Link>
              </div>
              <div className="mt-4 space-y-2">
                {summary.hotInquiries.slice(0, 5).map((lead) => (
                  <Link key={lead.id} href="/crm/inquiries" className="block rounded-xl border border-border-default px-4 py-3 hover:bg-surface-sunken">
                    <p className="font-medium text-text-primary">{lead.name}</p>
                    <p className="mt-1 text-xs capitalize text-text-secondary">{lead.event_type || "event"} via {lead.source || "unknown source"}</p>
                  </Link>
                ))}
                {summary.hotInquiries.length === 0 && <p className="text-sm text-text-secondary">No open inquiries need action.</p>}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
