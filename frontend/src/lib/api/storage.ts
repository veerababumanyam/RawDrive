const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface StorageConfig {
  driver: string;
  local_dir?: string;
  bucket: string;
  region: string;
  endpoint: string;
  access_key: string;
  secret_key: string;
}

export async function testStorageConnection(token: string, workspaceId: string, config: StorageConfig): Promise<{ status: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/storage-config/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}
