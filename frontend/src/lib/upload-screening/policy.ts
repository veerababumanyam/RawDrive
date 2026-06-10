// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S1: Upload policy catalog client.
//
// Wraps GET /api/v1/upload-policy/versions with a 10-minute in-memory cache
// so the browser worker doesn't hammer the backend on every upload. The
// response is a list of active policy versions; the worker stamps its
// manifests with the newest one.
//
// Cache scope: module-level. The main thread and the worker can share this
// file, but the worker's module-level cache is separate from the main
// thread's (workers are separate globals). That's fine — we trade a little
// duplication for simpler isolation.
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyVersion {
  policy_version: string;
  published_at: string;
  max_age_days: number;
  notes?: string;
}

interface CatalogResponse {
  versions: PolicyVersion[];
}

interface CacheEntry {
  versions: PolicyVersion[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: CacheEntry | null = null;
let inFlight: Promise<PolicyVersion[]> | null = null;

/**
 * Fetch the active policy versions from the backend, using an in-memory
 * cache. Callers pass the API base URL so the same function works in
 * both server-rendered and client-rendered contexts.
 *
 * Returns the cached copy when it is still fresh. On network failure
 * returns the stale cache (if any) rather than throwing, so a transient
 * outage does not block uploads. Throws only when there is no cache at
 * all and the fetch fails.
 */
export async function fetchPolicyVersions(apiUrl: string): Promise<PolicyVersion[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.versions;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const res = await fetch(`${apiUrl}/api/v1/upload-policy/versions`);
    if (!res.ok) {
      throw new Error(`policy catalog fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as CatalogResponse;
    cache = { versions: body.versions, fetchedAt: now };
    return body.versions;
  })();

  try {
    return await inFlight;
  } catch (err) {
    // Network error: fall back to stale cache if available.
    if (cache) {
      return cache.versions;
    }
    throw err;
  } finally {
    inFlight = null;
  }
}

/**
 * Return the newest active policy version, suitable for stamping onto a
 * new manifest. Falls back to a hard-coded default when the catalog is
 * empty or unreachable — this keeps uploads flowing in degraded mode
 * while the backend eventually rejects the stale version.
 */
export async function activePolicyVersion(apiUrl: string): Promise<string> {
  try {
    const versions = await fetchPolicyVersions(apiUrl);
    if (versions.length === 0) return FALLBACK_POLICY_VERSION;
    // Versions are ordered DESC by published_at in the backend response.
    return versions[0].policy_version;
  } catch {
    return FALLBACK_POLICY_VERSION;
  }
}

/**
 * Test-only: reset the module cache. Not exported in production builds
 * but harmless to call.
 */
export function _resetPolicyCache(): void {
  cache = null;
  inFlight = null;
}

/**
 * Fallback policy version used when the backend catalog is unreachable.
 * Matches the seed in migration 054. The backend will reject manifests
 * stamped with this version if it has since been revoked — that is the
 * intended fail-closed behaviour.
 */
export const FALLBACK_POLICY_VERSION = "upload-screening/2026-04-10";
