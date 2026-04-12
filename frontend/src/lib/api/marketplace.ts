import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface FreelancerListing {
  id: string;
  user_id: string;
  workspace_id: string;
  state_id: number;
  title: string;
  specializations: string[];
  city?: string;
  daily_rate_paisa?: number;
  description?: string;
  portfolio_gallery_id?: string;
  availability_calendar: Record<string, unknown>;
  is_published: boolean;
  rating_avg?: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export interface FreelancerReview {
  id: string;
  listing_id: string;
  reviewer_id: string;
  booking_id?: string;
  rating: number;
  review_text?: string;
  created_at: string;
}

export interface MarketplaceInquiry {
  id: string;
  type: string;
  listing_id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  event_date?: string;
  status: string;
  created_at: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listFreelancers(params?: {
  state_id?: number;
  city?: string;
  specialization?: string;
  sort?: string;
  min_rate_paisa?: number;
  max_rate_paisa?: number;
}): Promise<FreelancerListing[]> {
  const query = new URLSearchParams();
  if (params?.state_id) query.set("state_id", String(params.state_id));
  if (params?.city) query.set("city", params.city);
  if (params?.specialization) query.set("specialization", params.specialization);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.min_rate_paisa) query.set("min_rate_paisa", String(params.min_rate_paisa));
  if (params?.max_rate_paisa) query.set("max_rate_paisa", String(params.max_rate_paisa));

  // The marketplace GETs are public in principle but the backend
  // nests the route under the authenticated /api/v1 group, so a
  // bare fetch() without a token returns 401 from JWTAuth. Attach
  // the stored token when we have one so a logged-in user can
  // browse the marketplace from inside the app, and fall through
  // to an empty array if unauthenticated (e.g. anonymous landing
  // pages that embed the marketplace strip).
  const token = getStoredAccessToken();
  const res = await fetch(`${API_BASE}/api/v1/marketplace/freelancers?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getFreelancer(id: string): Promise<{ data: FreelancerListing; reviews: FreelancerReview[] }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${API_BASE}/api/v1/marketplace/freelancers/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.json();
}

export async function createFreelancerListing(token: string, data: {
  title: string;
  specializations: string[];
  city?: string;
  daily_rate_paisa?: number;
  description?: string;
  is_published: boolean;
}): Promise<FreelancerListing> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/freelancers`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function updateFreelancerListing(token: string, id: string, data: {
  title: string;
  specializations: string[];
  city?: string;
  daily_rate_paisa?: number;
  description?: string;
  is_published: boolean;
}): Promise<FreelancerListing> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/freelancers/${id}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function createInquiry(token: string, data: {
  type: string;
  listing_id: string;
  message: string;
}): Promise<MarketplaceInquiry> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/inquiries`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function listInquiries(token: string): Promise<MarketplaceInquiry[]> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/inquiries`, {
    headers: headers(token),
  });
  const json = await res.json();
  return json.data || [];
}
