import { authFetch } from "./authFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
void API_BASE;

export interface Invoice {
  id: string;
  workspace_id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  subtotal_paisa: number;
  cgst_paisa: number;
  sgst_paisa: number;
  igst_paisa: number;
  total_paisa: number;
  amount_paid_paisa: number;
  line_items: InvoiceLineItem[];
  contact_id?: string;
  project_id?: string;
  deal_id?: string;
  gallery_id?: string;
  quotation_valid_until?: string;
  credit_note_invoice_id?: string;
  credit_note_reason?: string;
  source_package_id?: string;
  due_date?: string;
  paid_at?: string;
  created_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_paisa: number;
  hsn_code: string;
  tax_rate: number;
}

export interface PackageAddon {
  id?: string;
  package_id?: string;
  name: string;
  description?: string;
  price_paisa: number;
}

export interface ServicePackage {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  inclusions: string[];
  base_price_paisa: number;
  gst_rate: number;
  sac_code: string;
  active: boolean;
  addons?: PackageAddon[];
  created_at: string;
  updated_at: string;
}

export interface GSTR1Entry {
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_gstin?: string;
  place_of_supply: string;
  sac_code: string;
  taxable_value_paisa: number;
  cgst_paisa: number;
  sgst_paisa: number;
  igst_paisa: number;
  total_paisa: number;
  supply_type: "B2B" | "B2C";
}

export interface GSTR1Report {
  financial_year: string;
  entries: GSTR1Entry[];
  b2b_count: number;
  b2c_count: number;
  total_taxable_paisa: number;
  total_cgst_paisa: number;
  total_sgst_paisa: number;
  total_igst_paisa: number;
  total_paisa: number;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export function formatPaisa(paisa: number): string {
  const rupees = Math.floor(Math.abs(paisa) / 100);
  const remainder = Math.abs(paisa) % 100;
  const sign = paisa < 0 ? "-" : "";
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${remainder.toString().padStart(2, "0")}`;
}

export async function listInvoices(_token: string, params?: { status?: string }): Promise<Invoice[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await authFetch(`/api/v1/billing/invoices?${query}`);
  if (!res.ok) throw new Error("Failed to fetch invoices");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.invoices)) return body.invoices;
  return [];
}

export async function createInvoice(_token: string, invoice: Partial<Invoice>): Promise<Invoice> {
  const res = await authFetch(`/api/v1/billing/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create invoice");
  }
  return res.json();
}

export async function convertQuotation(token: string, id: string): Promise<Invoice> {
  const res = await fetch(`${API_BASE}/api/v1/billing/invoices/${id}/convert`, {
    method: "POST",
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to convert quotation");
  return res.json();
}

export async function listServicePackages(_token: string): Promise<ServicePackage[]> {
  const res = await authFetch(`/api/v1/billing/packages`);
  if (!res.ok) throw new Error("Failed to fetch service packages");
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

export async function createServicePackage(_token: string, pkg: Partial<ServicePackage>): Promise<ServicePackage> {
  const res = await authFetch(`/api/v1/billing/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pkg),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create service package");
  }
  return res.json();
}

export async function updateServicePackage(token: string, id: string, pkg: Partial<ServicePackage>): Promise<ServicePackage> {
  const res = await fetch(`${API_BASE}/api/v1/billing/packages/${id}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(pkg),
  });
  if (!res.ok) throw new Error("Failed to update service package");
  return res.json();
}

export async function deleteServicePackage(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/billing/packages/${id}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error("Failed to delete service package");
}

export async function expandPackageLineItems(token: string, packageId: string): Promise<InvoiceLineItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/billing/packages/${packageId}/line-items`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to expand package");
  const body = await res.json();
  return Array.isArray(body?.line_items) ? body.line_items : [];
}

export async function getGSTR1Report(token: string, financialYear: string): Promise<GSTR1Report> {
  const query = new URLSearchParams({ fy: financialYear }).toString();
  const res = await fetch(`${API_BASE}/api/v1/billing/reports/gstr1?${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch GSTR-1 report");
  return res.json();
}

export async function downloadGSTR1CSV(token: string, financialYear: string): Promise<Blob> {
  const query = new URLSearchParams({ fy: financialYear, format: "csv" }).toString();
  const res = await fetch(`${API_BASE}/api/v1/billing/reports/gstr1?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to download GSTR-1 CSV");
  return res.blob();
}

// ── Auto-authenticated versions ─────────────────────────────────────
export async function createInvoiceAuth(invoice: Partial<Invoice>): Promise<Invoice> {
  const res = await authFetch("/api/v1/billing/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create invoice");
  }
  return res.json();
}

export async function createServicePackageAuth(pkg: Partial<ServicePackage>): Promise<ServicePackage> {
  const res = await authFetch("/api/v1/billing/packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pkg),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create service package");
  }
  return res.json();
}
