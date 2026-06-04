"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <CRMSecondaryNav />

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-accent-primary">
            Studio Projects
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">
            Project Board
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            One job record for the client, shoot date, documents, billing,
            gallery delivery, and next action.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="min-h-[44px] rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:bg-accent-hover"
        >
          New Project
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            Active projects
          </p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {summary.activeProjects.length}
          </p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            Booked value
          </p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {formatPaisa(summary.bookedValue)}
          </p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            Balance due
          </p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {formatPaisa(summary.balanceDue)}
          </p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            Next actions
          </p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {summary.nextActions.length}
          </p>
        </div>
      </section>

      {showCreate && (
        <section className="rounded-2xl border border-border-default bg-surface-raised p-6">
          <h2 className="text-lg font-semibold text-text-primary">
            New Studio Project
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              value={form.contact_id}
              onChange={(event) =>
                setForm({ ...form, contact_id: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
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
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Project name *"
            />
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
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
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.event_date}
              onChange={(event) =>
                setForm({ ...form, event_date: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            />
            <input
              value={form.venue_name}
              onChange={(event) =>
                setForm({ ...form, venue_name: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Venue"
            />
            <input
              value={form.city}
              onChange={(event) =>
                setForm({ ...form, city: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="City"
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
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Expected value"
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
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Booked value"
            />
            <input
              value={form.next_action}
              onChange={(event) =>
                setForm({ ...form, next_action: event.target.value })
              }
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Next action"
            />
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className="md:col-span-2 min-h-[88px] rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              placeholder="Notes"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="min-h-[44px] rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.contact_id || !form.name.trim()}
              className="min-h-[44px] rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-44 animate-pulse rounded-2xl bg-surface-sunken"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
          <p className="font-medium text-text-primary">No projects yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Create a project from a client or convert an inquiry into a booked
            job.
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/crm/projects/${project.id}`}
              className="rounded-2xl border border-border-default bg-surface-raised p-5 transition-colors hover:bg-surface-sunken"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-text-primary">
                    {project.name}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
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
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-text-tertiary">Expected</p>
                  <p className="font-medium text-text-primary">
                    {formatPaisa(project.expected_value_paisa || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-text-tertiary">Booked</p>
                  <p className="font-medium text-text-primary">
                    {formatPaisa(project.booked_value_paisa || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-text-tertiary">Balance</p>
                  <p className="font-medium text-text-primary">
                    {formatPaisa(project.balance_due_paisa || 0)}
                  </p>
                </div>
              </div>
              {project.next_action && (
                <p className="mt-4 rounded-xl bg-accent-subtle px-3 py-2 text-sm text-accent-primary">
                  Next: {project.next_action}
                </p>
              )}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
