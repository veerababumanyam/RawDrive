"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { Plus } from "@/components/icons";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  createProjectAuth,
  listContacts,
  listProjects,
  type Contact,
  type StudioProject,
} from "@/lib/api/crm";
import { formatPaisa } from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_CLASS,
  PROJECT_STATUSES,
  getProjectStatusLabel,
} from "@/lib/crm-taxonomy";

const FIELD_CLASS = "input-base w-full text-sm";

const PROJECT_TYPES = [
  "wedding",
  "pre_wedding",
  "portrait",
  "corporate",
  "commercial",
  "newborn",
  "family",
  "other",
];

function formatDate(value?: string) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatProjectType(value: string) {
  return value.replaceAll("_", " ");
}

function ProjectStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="panel" padding="sm" className="crm-stat-card">
      <span className="crm-stat-card__label">{label}</span>
      <span className="crm-stat-card__value">{value}</span>
    </Card>
  );
}

function emptyForm() {
  return {
    contact_id: "",
    name: "",
    project_type: "wedding",
    status: "quoted",
    event_date: "",
    venue_name: "",
    city: "",
    expected_value_rupees: 0,
    booked_value_rupees: 0,
    next_action: "",
    notes: "",
  };
}

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const createRequested = searchParams?.get("create") === "true";
  const clientParam = searchParams?.get("client") ?? "";
  const [token] = useState(() => getStoredAccessToken());
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(
    token ? null : "Missing access token",
  );
  const [showCreate, setShowCreate] = useState(() => createRequested);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => {
    const base = emptyForm();
    if (createRequested && clientParam)
      return { ...base, contact_id: clientParam };
    return base;
  });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    Promise.all([listProjects(token), listContacts(token)])
      .then(([projectRows, contactRows]) => {
        setProjects(projectRows);
        setContacts(contactRows);
        setError(null);
      })
      .catch((err) => {
        setProjects([]);
        setError(
          err instanceof Error ? err.message : "Failed to load projects",
        );
      })
      .finally(() => setLoading(false));
  }, [token, refreshTick]);

  const summary = useMemo(() => {
    const activeProjects = projects.filter(
      (project) => !["archived", "cancelled", "lost"].includes(project.status),
    );
    const bookedValue = projects.reduce(
      (sum, project) => sum + (project.booked_value_paisa || 0),
      0,
    );
    const balanceDue = projects.reduce(
      (sum, project) => sum + (project.balance_due_paisa || 0),
      0,
    );
    const nextActions = projects.filter((project) =>
      Boolean(project.next_action),
    );
    return { activeProjects, bookedValue, balanceDue, nextActions };
  }, [projects]);

  const handleCreate = async () => {
    if (!token || !form.contact_id || !form.name.trim() || creating) return;
    const isDuplicate = projects.some(
      (p) =>
        p.name?.toLowerCase() === form.name.trim().toLowerCase() &&
        p.contact_id === form.contact_id,
    );
    if (isDuplicate) {
      setError(
        `A project named "${form.name.trim()}" already exists for this client`,
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // QA #25: createProjectAuth handles 401 refresh AND strips empty-string
      // UUID fields (lead_id / source_deal_id / package_id) that the backend
      // rejects as "invalid UUID" — the legacy createProject sent "" on
      // optional UUIDs, producing a 500 when every optional field was
      // populated but ids remained blank.
      // QA #25 secondary: cap balance_due at >=0 and expected_value >=
      // booked_value so we never post a negative balance; the backend
      // CHECK constraint rejects that as "create project failed".
      const expectedPaisa = Math.round(form.expected_value_rupees * 100);
      const bookedPaisa = Math.round(form.booked_value_rupees * 100);
      const balanceDuePaisa = Math.max(0, expectedPaisa - bookedPaisa);
      await createProjectAuth({
        contact_id: form.contact_id,
        name: form.name.trim(),
        project_type: form.project_type,
        status: form.status,
        event_date: form.event_date || undefined,
        venue_name: form.venue_name.trim() || undefined,
        city: form.city.trim() || undefined,
        expected_value_paisa: expectedPaisa,
        booked_value_paisa: bookedPaisa,
        balance_due_paisa: balanceDuePaisa,
        next_action: form.next_action.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setShowCreate(false);
      setForm(emptyForm());
      setRefreshTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageContainer width="wide">
      <CRMSecondaryNav />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <PageHeader
        eyebrow="Studio Projects"
        title="Project Board"
        description="One job record for the client, shoot date, documents, billing, gallery delivery, and next action."
        actions={
          <GlassButton
            type="button"
            onClick={() => setShowCreate(true)}
            variant="primary"
            icon={<Plus aria-hidden="true" />}
          >
            New Project
          </GlassButton>
        }
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <ProjectStatCard
          label="Active projects"
          value={String(summary.activeProjects.length)}
        />
        <ProjectStatCard
          label="Booked value"
          value={formatPaisa(summary.bookedValue)}
        />
        <ProjectStatCard
          label="Balance due"
          value={formatPaisa(summary.balanceDue)}
        />
        <ProjectStatCard
          label="Next actions"
          value={String(summary.nextActions.length)}
        />
      </section>

      {showCreate && (
        <Card variant="glass" padding="md" aria-labelledby="new-project-title">
          <CardHeader>
            <CardTitle id="new-project-title">New Studio Project</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              value={form.contact_id}
              onChange={(event) =>
                setForm({ ...form, contact_id: event.target.value })
              }
              className={FIELD_CLASS}
              aria-label="Project client"
            >
              <option value="">Select client *</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className={FIELD_CLASS}
              placeholder="Project name *"
              aria-label="Project name"
            />
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
              className={FIELD_CLASS}
              aria-label="Project status"
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getProjectStatusLabel(status)}
                </option>
              ))}
            </select>
            <select
              value={form.project_type}
              onChange={(event) =>
                setForm({ ...form, project_type: event.target.value })
              }
              className={FIELD_CLASS}
              aria-label="Project type"
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatProjectType(type)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.event_date}
              onChange={(event) =>
                setForm({ ...form, event_date: event.target.value })
              }
              className={FIELD_CLASS}
              aria-label="Project event date"
            />
            <input
              value={form.venue_name}
              onChange={(event) =>
                setForm({ ...form, venue_name: event.target.value })
              }
              className={FIELD_CLASS}
              placeholder="Venue"
              aria-label="Project venue"
            />
            <input
              value={form.city}
              onChange={(event) =>
                setForm({ ...form, city: event.target.value })
              }
              className={FIELD_CLASS}
              placeholder="City"
              aria-label="Project city"
            />
            <input
              type="number"
              min="0"
              value={form.expected_value_rupees}
              onChange={(event) =>
                setForm({
                  ...form,
                  expected_value_rupees: Number(event.target.value) || 0,
                })
              }
              className={FIELD_CLASS}
              placeholder="Expected value"
              aria-label="Project expected value"
            />
            <input
              type="number"
              min="0"
              value={form.booked_value_rupees}
              onChange={(event) =>
                setForm({
                  ...form,
                  booked_value_rupees: Number(event.target.value) || 0,
                })
              }
              className={FIELD_CLASS}
              placeholder="Booked value"
              aria-label="Project booked value"
            />
            <input
              value={form.next_action}
              onChange={(event) =>
                setForm({ ...form, next_action: event.target.value })
              }
              className={FIELD_CLASS}
              placeholder="Next action"
              aria-label="Project next action"
            />
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className={cn(FIELD_CLASS, "resize-y md:col-span-2")}
              placeholder="Notes"
              aria-label="Project notes"
              rows={3}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <GlassButton
              type="button"
              onClick={() => setShowCreate(false)}
              variant="surface"
              disabled={creating}
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="button"
              onClick={handleCreate}
              disabled={creating || !form.contact_id || !form.name.trim()}
              variant="primary"
            >
              {creating ? "Creating..." : "Create Project"}
            </GlassButton>
          </CardFooter>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
      ) : projects.length === 0 ? (
        <Card variant="panel" padding="lg" className="text-center">
          <p className="font-medium text-text-primary">No projects yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Create a project from a client or convert an inquiry into a booked
            job.
          </p>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/crm/projects/${project.id}`}
              className="surface-panel card-pad-md crm-project-card"
            >
              <div className="crm-project-card__header">
                <div className="min-w-0">
                  <p className="crm-project-card__title">{project.name}</p>
                  <p className="crm-project-card__meta">
                    {[
                      project.contact_name,
                      formatDate(project.event_date),
                      project.city,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={cn(
                    PROJECT_STATUS_CLASS[project.status] ||
                      "status-badge status-badge--neutral",
                  )}
                >
                  {getProjectStatusLabel(project.status)}
                </span>
              </div>
              <dl className="crm-project-card__metrics">
                <div>
                  <dt>Expected</dt>
                  <dd>{formatPaisa(project.expected_value_paisa || 0)}</dd>
                </div>
                <div>
                  <dt>Booked</dt>
                  <dd>{formatPaisa(project.booked_value_paisa || 0)}</dd>
                </div>
                <div>
                  <dt>Balance</dt>
                  <dd>{formatPaisa(project.balance_due_paisa || 0)}</dd>
                </div>
              </dl>
              {project.next_action && (
                <p className="crm-project-card__next">
                  Next: {project.next_action}
                </p>
              )}
            </Link>
          ))}
        </section>
      )}
    </PageContainer>
  );
}
