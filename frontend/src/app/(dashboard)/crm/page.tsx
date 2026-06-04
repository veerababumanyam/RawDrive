"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  ReceiptText,
  UserPlus,
} from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { listEvents, type CalendarEvent } from "@/lib/api/calendar";
import { listInvoices, formatPaisa, type Invoice } from "@/lib/api/billing";
import { listGalleries, type Gallery } from "@/lib/api/galleries";
import {
  listLeads,
  listProjects,
  type Lead,
  type StudioProject,
} from "@/lib/api/crm";
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
  return Boolean(
    invoice.due_date && new Date(invoice.due_date).getTime() < Date.now(),
  );
}
function StatCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="surface-panel card-pad-sm crm-stat-card"
    >
      <span className="crm-stat-card__label">{label}</span>
      <span className="crm-stat-card__value">{value}</span>
      <span className="crm-stat-card__detail">{detail}</span>
    </Link>
  );
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
      className="glass-button glass-button--surface glass-button--md"
    >
      <span className="glass-button__icon">{icon}</span>
      <span>{children}</span>
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
        error:
          failed?.status === "rejected"
            ? failed.reason?.message || "Some CRM data could not be loaded"
            : null,
      });
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [token]);
  const summary = useMemo(() => {
    const hotInquiries = state.leads.filter(isOpenInquiry);
    const upcomingShoots = state.events.filter(
      (event) => event.event_type === "shoot" && event.status !== "cancelled",
    );
    const overdueInvoices = state.invoices.filter(isOverdueInvoice);
    const bookedValue = state.projects
      .filter((project) =>
        ["booked", "shooting", "editing", "proofing", "delivered"].includes(
          project.status,
        ),
      )
      .reduce(
        (sum, project) =>
          sum +
          (project.booked_value_paisa || project.expected_value_paisa || 0),
        0,
      );
    const outstanding = state.invoices.reduce(
      (sum, invoice) =>
        sum + Math.max(0, invoice.total_paisa - invoice.amount_paid_paisa),
      0,
    );
    const taxCollected = state.invoices.reduce(
      (sum, invoice) =>
        sum + invoice.cgst_paisa + invoice.sgst_paisa + invoice.igst_paisa,
      0,
    );
    return {
      hotInquiries,
      upcomingShoots,
      overdueInvoices,
      bookedValue,
      outstanding,
      taxCollected,
    };
  }, [state]);
  return (
    <PageContainer width="wide">
      <CRMSecondaryNav />
      {state.error && (
        <InlineAlert variant="error">{state.error}</InlineAlert>
      )}
      <PageHeader
        eyebrow="Studio CRM"
        title="Studio CRM"
        description="Today in your studio: inquiries, projects, bookings, billing, delivery, and tax in one operating view."
        actions={
          <>
            <ActionLink
              href="/crm/inquiries"
              icon={<UserPlus aria-hidden="true" />}
            >
              New Inquiry
            </ActionLink>
            <ActionLink
              href="/crm/projects?create=true"
              icon={<Briefcase aria-hidden="true" />}
            >
              New Project
            </ActionLink>
            <ActionLink
              href="/calendar?create=true"
              icon={<CalendarDays aria-hidden="true" />}
            >
              Book Shoot
            </ActionLink>
            <ActionLink
              href="/billing?create=true"
              icon={<ReceiptText aria-hidden="true" />}
            >
              Create Invoice
            </ActionLink>
          </>
        }
      />
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <Card
              key={item}
              variant="panel"
              padding="none"
              className="crm-overview-skeleton"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Hot inquiries"
              value={String(summary.hotInquiries.length)}
              detail="Open leads needing conversion"
              href="/crm/inquiries"
            />
            <StatCard
              label="Upcoming shoots"
              value={String(summary.upcomingShoots.length)}
              detail="Next 30 days on calendar"
              href="/calendar"
            />
            <StatCard
              label="Pending contracts"
              value="0"
              detail="Documents workspace lands next"
              href="/crm/documents"
            />
            <StatCard
              label="Overdue invoices"
              value={String(summary.overdueInvoices.length)}
              detail={`${formatPaisa(summary.outstanding)} outstanding`}
              href="/billing"
            />
            <StatCard
              label="Active galleries"
              value={String(state.galleries.length)}
              detail="Delivery and proofing work"
              href="/galleries"
            />
            <StatCard
              label="Booked value"
              value={formatPaisa(summary.bookedValue)}
              detail="Booked and delivered projects"
              href="/crm/projects"
            />
            <StatCard
              label="GST tracked"
              value={formatPaisa(summary.taxCollected)}
              detail="From listed invoices"
              href="/reports/gstr1"
            />
            <StatCard
              label="Price book"
              value="Open"
              detail="Packages that feed quotes and invoices"
              href="/settings/packages"
            />
          </section>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card variant="panel" padding="md" className="xl:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <CardHeader className="mb-0">
                  <CardTitle>Project pipeline</CardTitle>
                  <CardDescription>
                    Projects are the shared job record for bookings, billing,
                    documents, and galleries.
                  </CardDescription>
                </CardHeader>
                <Link
                  href="/crm/projects"
                  className="glass-button glass-button--quiet glass-button--sm"
                >
                  <span className="glass-button__icon">
                    <Briefcase aria-hidden="true" />
                  </span>
                  <span>Open Projects</span>
                </Link>
              </div>
              <CardContent className="mt-4 space-y-2">
                {state.projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/crm/projects/${project.id}`}
                    className="crm-overview-list-link"
                  >
                    <span className="crm-overview-list-link__title">
                      {project.name}
                    </span>
                    <span className="crm-overview-list-link__meta">
                      {formatPaisa(project.expected_value_paisa || 0)}
                    </span>
                  </Link>
                ))}
                {state.projects.length === 0 && (
                  <p className="crm-empty-copy">
                    No projects yet. Convert an inquiry or create a project.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card variant="panel" padding="md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <CardHeader className="mb-0">
                  <CardTitle>Follow-up queue</CardTitle>
                  <CardDescription>
                    M25 surfaces the queue; M28 adds cross-entity automation.
                  </CardDescription>
                </CardHeader>
                <Link
                  href="/crm/inquiries"
                  className="glass-button glass-button--quiet glass-button--sm"
                >
                  <span className="glass-button__icon">
                    <ArrowRight aria-hidden="true" />
                  </span>
                  <span>Review</span>
                </Link>
              </div>
              <CardContent className="mt-4 space-y-2">
                {summary.hotInquiries.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href="/crm/inquiries"
                    className="crm-overview-list-link crm-overview-list-link--stacked"
                  >
                    <span className="crm-overview-list-link__title">
                      {lead.name}
                    </span>
                    <span className="crm-overview-list-link__meta capitalize">
                      {lead.event_type || "event"} via{" "}
                      {lead.source || "unknown source"}
                    </span>
                  </Link>
                ))}
                {summary.hotInquiries.length === 0 && (
                  <p className="crm-empty-copy">
                    No open inquiries need action.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </PageContainer>
  );
}
