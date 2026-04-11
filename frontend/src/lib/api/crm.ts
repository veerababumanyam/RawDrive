const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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

export interface FollowUp {
  id: string;
  type: string;
  due_at: string;
  status: string;
  notes?: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listLeads(token: string, params?: { stage?: string; source?: string; search?: string }): Promise<Lead[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/crm/leads?${query}`, { headers: headers(token) });
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

export async function listContacts(token: string, params?: { type?: string; search?: string }): Promise<Contact[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/crm/contacts?${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.contacts)) return body.contacts;
  return [];
}

export async function createContact(token: string, contact: Partial<Contact>): Promise<Contact> {
  const res = await fetch(`${API_BASE}/api/v1/crm/contacts`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error("Failed to create contact");
  return res.json();
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
