const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface ProofingSelection {
  id: string;
  gallery_id: string;
  asset_id: string;
  client_name: string;
  client_email: string;
  status: string;
  note: string;
  created_at: string;
}

export async function listProofingSelections(token: string, galleryId: string): Promise<ProofingSelection[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list proofing: ${res.status}`);
  return res.json();
}

export async function updateSelectionStatus(token: string, galleryId: string, selectionId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/${selectionId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update status: ${res.status}`);
}

export async function submitPublicProofing(slug: string, data: {
  asset_ids: string[];
  client_name: string;
  client_email: string;
  note?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to submit proofing: ${res.status}`);
}
