const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface GearListing {
  id: string;
  user_id: string;
  workspace_id: string;
  state_id: number;
  listing_type: string;
  title: string;
  category: string;
  brand?: string;
  model?: string;
  condition?: string;
  price_paisa: number;
  description?: string;
  images: string[];
  city?: string;
  is_published: boolean;
  is_available: boolean;
  availability_calendar: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GearBooking {
  id: string;
  gear_listing_id: string;
  renter_id: string;
  owner_id: string;
  start_date: string;
  end_date: string;
  total_paisa: number;
  deposit_paisa: number;
  status: string;
  created_at: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listGear(params?: {
  category?: string;
  brand?: string;
  state_id?: number;
  sort?: string;
}): Promise<GearListing[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.brand) query.set("brand", params.brand);
  if (params?.state_id) query.set("state_id", String(params.state_id));
  if (params?.sort) query.set("sort", params.sort);

  const res = await fetch(`${API_BASE}/api/v1/marketplace/gear?${query}`);
  const json = await res.json();
  return json.data || [];
}

export async function getGear(id: string): Promise<GearListing> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/gear/${id}`);
  const json = await res.json();
  return json.data;
}

export async function createGearListing(token: string, data: {
  listing_type: string;
  title: string;
  category: string;
  brand?: string;
  model?: string;
  condition?: string;
  price_paisa: number;
  description?: string;
  images?: string[];
  city?: string;
  is_published: boolean;
}): Promise<GearListing> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/gear`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

export async function deleteGearListing(token: string, id: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/marketplace/gear/${id}`, {
    method: "DELETE",
    headers: headers(token),
  });
}

export async function createGearBooking(token: string, id: string, data: {
  start_date: string;
  end_date: string;
  total_paisa: number;
  deposit_paisa: number;
  message?: string;
}): Promise<GearBooking> {
  const res = await fetch(`${API_BASE}/api/v1/marketplace/gear/${id}/bookings`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}
