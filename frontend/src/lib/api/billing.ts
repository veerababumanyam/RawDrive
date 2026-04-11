const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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

export async function listInvoices(token: string, params?: { status?: string }): Promise<Invoice[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/billing/invoices?${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch invoices");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.invoices)) return body.invoices;
  return [];
}

export async function createInvoice(token: string, invoice: Partial<Invoice>): Promise<Invoice> {
  const res = await fetch(`${API_BASE}/api/v1/billing/invoices`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(invoice),
  });
  if (!res.ok) throw new Error("Failed to create invoice");
  return res.json();
}
