import { getApiBaseUrl } from "@/lib/api/base-url";
const API_BASE = getApiBaseUrl();

export interface Lead {
  id: string;
  workspace_id: string;
  name: string;
  phone?: string;
  email?: string;
  source: string;
  stage: string;
  event_type?: string;
  event_date?: string;
  budget_paisa?: number;
  follow_up_date?: string;
  assigned_to?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  name: string;
  phone?: string;
  email?: string;
  contact_type: string;
  company?: string;
  tags: string[];
  total_revenue_paisa: number;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  workspace_id: string;
  contact_id: string;
  title: string;
  stage: string;
  amount_paisa: number;
  advance_paisa?: number;
  event_type?: string;
  event_date?: string;
  venue?: string;
  notes?: string;
  created_at: string;
}

export interface StudioProject {
  id: string;
  workspace_id: string;
  contact_id: string;
  contact_name?: string;
  lead_id?: string;
  source_deal_id?: string;
  package_id?: string;
  name: string;
  project_type: string;
  status: string;
  event_date?: string;
  event_end_date?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  state_code?: string;
  expected_value_paisa: number;
  booked_value_paisa: number;
  balance_due_paisa: number;
  contract_status: string;
  gallery_status: string;
  next_action?: string;
  next_action_due_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

export interface FollowUp {
  id: string;
  type: string;
  project_id?: string;
  due_at: string;
  status: string;
  notes?: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listLeads(_token: string, params?: { stage?: string; source?: string; search?: string }): Promise<Lead[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const { authFetch: af } = await import("./authFetch");
  const res = await af(`/api/v1/crm/leads?${query}`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.leads)) return body.leads;
  return [];
}

export async function createLead(token: string, lead: Partial<Lead>): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/v1/crm/leads`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(lead),
  });
  if (!res.ok) throw new Error("Failed to create lead");
  return res.json();
}

export async function updateLeadStage(token: string, id: string, stage: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/crm/leads/${id}/stage`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) throw new Error("Failed to update lead stage");
}

export async function listContacts(_token: string, params?: { type?: string; search?: string }): Promise<Contact[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const { authFetch: af } = await import("./authFetch");
  const res = await af(`/api/v1/crm/contacts?${query}`);
  if (!res.ok) throw new Error("Failed to fetch contacts");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.contacts)) return body.contacts;
  return [];
}

export async function createContact(_token: string, contact: Partial<Contact>): Promise<Contact> {
  const { authFetch: af } = await import("./authFetch");
  const res = await af(`/api/v1/crm/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create contact");
  }
  return res.json();
}

export interface ContactImportResult {
  imported: number;
  skipped: number;
  errors?: string[];
}

// Uploads a CSV file of contacts. The backend expects a multipart form with
// field name "file" and a header row containing at minimum "name". Optional
// columns: email, phone, company, type, tags (semicolon-separated).
export async function importContactsCSV(token: string, file: File): Promise<ContactImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/crm/contacts/import`, {
    method: "POST",
    // Intentionally NO Content-Type header — browser sets the multipart
    // boundary automatically when the body is FormData.
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to import contacts");
  }
  return res.json();
}

// ---------- 360-degree client profile ----------

export interface ProfileContact {
  id: string;
  workspace_id: string;
  name: string;
  phone?: string;
  email?: string;
  contact_type: string;
  company?: string;
  address?: string;
  tags: string[];
  notes?: string;
  total_revenue_paisa: number;
  whatsapp_number?: string;
  gstin?: string;
  pan?: string;
  birthday?: string;
  anniversary?: string;
  referral_source?: string;
  client_source?: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_paisa: number;
  amount_paid_paisa: number;
  created_at: string;
}

export interface ProfileDeal {
  id: string;
  title: string;
  stage: string;
  amount_paisa: number;
  event_type?: string;
  event_date?: string;
}

export interface ProfileProject {
  id: string;
  name: string;
  status: string;
  project_type: string;
  event_date?: string;
  expected_value_paisa: number;
  booked_value_paisa: number;
  balance_due_paisa: number;
  contract_status: string;
  gallery_status: string;
  next_action?: string;
}

export interface ProfileEvent {
  id: string;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string;
  location?: string;
  project_id?: string;
}

export interface ProfileGallery {
  id: string;
  title: string;
  photo_count: number;
  status: string;
  cover_thumbnail_url?: string;
}

export interface ClientProfileResponse {
  contact: ProfileContact;
  galleries: ProfileGallery[];
  invoices: ProfileInvoice[];
  projects: ProfileProject[];
  deals: ProfileDeal[];
  events: ProfileEvent[];
  lifetime_revenue_paisa: number;
}

export interface ProjectTimelineEntry {
  timestamp: string;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
}

export interface StudioProjectAggregate {
  project: StudioProject;
  contact?: Contact;
  inquiry?: Lead;
  bookings: Array<{
    id: string;
    title: string;
    event_type: string;
    start_at: string;
    end_at: string;
    location?: string;
    status: string;
  }>;
  contracts: Array<{
    id: string;
    title: string;
    status: string;
    total_value_paisa?: number;
    created_at: string;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    total_paisa: number;
    amount_paid_paisa: number;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    invoice_id: string;
    amount_paisa: number;
    method: string;
    payment_date: string;
  }>;
  galleries: Array<{
    id: string;
    title: string;
    slug: string;
    gallery_type: string;
    status: string;
    photo_count: number;
    created_at: string;
  }>;
  follow_ups: FollowUp[];
  timeline: ProjectTimelineEntry[];
}

export interface TimelineEntry {
  timestamp: string;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
}

export async function getClientProfile(token: string, contactId: string): Promise<ClientProfileResponse> {
  const res = await fetch(`${API_BASE}/api/v1/crm/contacts/${contactId}/profile`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to fetch client profile");
  return res.json();
}

export async function getClientTimeline(token: string, contactId: string): Promise<TimelineEntry[]> {
  const res = await fetch(`${API_BASE}/api/v1/crm/contacts/${contactId}/timeline`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to fetch client timeline");
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

export async function listDeals(token: string, params?: { stage?: string }): Promise<Deal[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/crm/deals?${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch deals");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.deals)) return body.deals;
  return [];
}

export async function listProjects(_token: string, params?: { status?: string; contact_id?: string; search?: string }): Promise<StudioProject[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const { authFetch: af } = await import("./authFetch");
  const res = await af(`/api/v1/crm/projects?${query}`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.projects)) return body.projects;
  return [];
}

export async function createProject(token: string, project: Partial<StudioProject>): Promise<StudioProject> {
  const res = await fetch(`${API_BASE}/api/v1/crm/projects`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function getProject(token: string, id: string): Promise<StudioProjectAggregate> {
  const res = await fetch(`${API_BASE}/api/v1/crm/projects/${id}`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

// ── Auto-authenticated versions (no token parameter needed) ─────────
import { authFetch } from "./authFetch";

/** Create a project with automatic token refresh. Cleans empty optional UUID fields. */
export async function createProjectAuth(project: Partial<StudioProject>): Promise<StudioProject> {
  // Clean empty string UUIDs — backend rejects "" for uuid.UUID fields
  const cleaned = { ...project };
  for (const key of ["lead_id", "source_deal_id", "package_id", "event_id"] as const) {
    if (cleaned[key as keyof typeof cleaned] === "") {
      delete cleaned[key as keyof typeof cleaned];
    }
  }
  const res = await authFetch("/api/v1/crm/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cleaned),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create project");
  }
  return res.json();
}

/** Create a contact with automatic token refresh (QA #30 sibling). */
export async function createContactAuth(contact: Partial<Contact>): Promise<Contact> {
  const res = await authFetch("/api/v1/crm/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create contact");
  }
  return res.json();
}

/** Import CSV contacts with automatic token refresh. */
export async function importContactsCsvAuth(file: File): Promise<{ imported: number; skipped: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authFetch("/api/v1/crm/contacts/import", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to import contacts");
  }
  return res.json();
}
