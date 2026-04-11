const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type DealerStatus = "pending" | "approved" | "suspended" | "terminated";
export type TerritoryType = "primary" | "secondary" | "ambassador";

export interface BankAccount {
  bank: string;
  ifsc: string;
  account_number: string;
  upi_id?: string;
}

export interface Dealer {
  id: string;
  user_id: string;
  state_id: number;
  business_name: string;
  territory_type: TerritoryType;
  status: DealerStatus;
  commission_rate_pct: number | null;
  bank_account: BankAccount | null;
  pan_number: string;
  gstin: string;
  referral_code: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDealerRequest {
  business_name: string;
  state_id: number;
  territory_type: TerritoryType;
  pan_number: string;
  gstin?: string;
  bank_account: BankAccount;
  agreement_accepted: boolean;
}

export interface CouponValidationResponse {
  coupon_code: string;
  discount_type: string;
  discount_value: number;
  applicable: boolean;
  original_amount_paisa: number;
  discounted_amount_paisa: number;
  dealer_id?: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function createDealer(token: string, data: CreateDealerRequest): Promise<Dealer> {
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(err.error || "Failed to register dealer");
  }
  return res.json();
}

export async function listDealers(token: string, params?: { status?: string; state_id?: string }): Promise<Dealer[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers?${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch dealers");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.dealers)) return body.dealers;
  return [];
}

export async function approveDealer(token: string, id: string, commissionRate: number): Promise<Dealer> {
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers/${id}/approve`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({ commission_rate_pct: commissionRate }),
  });
  if (!res.ok) throw new Error("Failed to approve dealer");
  return res.json();
}

export async function rejectDealer(token: string, id: string, reason: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers/${id}/reject`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error("Failed to reject dealer");
}

export async function getDealerDashboard(token: string): Promise<Dealer> {
  const res = await fetch(`${API_BASE}/api/v1/dealers/dashboard`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch dealer dashboard");
  return res.json();
}

export async function validateCoupon(token: string, couponCode: string): Promise<CouponValidationResponse> {
  const res = await fetch(`${API_BASE}/api/v1/onboarding/coupon`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ coupon_code: couponCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: "UNKNOWN", message: "Unknown error" }));
    throw new Error(err.message || err.code || "Coupon validation failed");
  }
  return res.json();
}
