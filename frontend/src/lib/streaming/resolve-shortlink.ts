// Server-only helper that fronts GET /api/v1/public/s/{code}.
// Maps backend status codes to a typed discriminant the page component
// can pattern-match on. Forwards X-Forwarded-For so per-IP rate limiting
// on the Go handler is keyed by the real viewer, not the Next.js server.

const API_BASE =
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

export type SrcTag = "qr" | "wa" | "email" | "invite" | "direct";

const ALLOWED_SRC: ReadonlySet<SrcTag> = new Set([
  "qr",
  "wa",
  "email",
  "invite",
  "direct",
]);

export function normalizeSrc(input: string | undefined | null): SrcTag {
  if (!input) return "direct";
  const s = String(input).trim().toLowerCase();
  return ALLOWED_SRC.has(s as SrcTag) ? (s as SrcTag) : "direct";
}

export interface PublicStreamMeta {
  stream_title?: string;
  status?: string;
  scheduled_start_at?: string;
  access_policy?: string;
  protected?: boolean;
}

export type ResolvedShortlink =
  | {
      kind: "ok";
      streamId: string;
      src: SrcTag;
      stream: PublicStreamMeta;
    }
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "rate_limited" }
  | { kind: "error" };

// SSRF guard: only the URL-encoded path segment may reflect the user's
// shortcode; query strings are constructed with URLSearchParams.
export async function resolveShortlink(
  code: string,
  src: string | undefined,
  forwardedFor: string | null,
): Promise<ResolvedShortlink> {
  const normalizedSrc = normalizeSrc(src);
  const params = new URLSearchParams({ src: normalizedSrc });
  const url = `${API_BASE}/api/v1/public/s/${encodeURIComponent(code)}?${params.toString()}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { kind: "error" };
  }

  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 410) return { kind: "revoked" };
  if (res.status === 429) return { kind: "rate_limited" };
  if (!res.ok) return { kind: "error" };

  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { kind: "error" };
  }

  const streamId = typeof payload.stream_id === "string" ? payload.stream_id : "";
  if (!streamId) return { kind: "error" };

  const stream: PublicStreamMeta = {
    stream_title:
      typeof payload.stream_title === "string"
        ? (payload.stream_title as string)
        : undefined,
    status: typeof payload.status === "string" ? (payload.status as string) : undefined,
    scheduled_start_at:
      typeof payload.scheduled_start_at === "string"
        ? (payload.scheduled_start_at as string)
        : undefined,
    access_policy:
      typeof payload.access_policy === "string"
        ? (payload.access_policy as string)
        : undefined,
    protected: typeof payload.protected === "boolean" ? payload.protected : undefined,
  };

  return {
    kind: "ok",
    streamId,
    src: normalizeSrc(typeof payload.src === "string" ? (payload.src as string) : normalizedSrc),
    stream,
  };
}

// Open-redirect guard: the resolver is upstream-trusted but defence in depth
// requires the Next page to validate the streamId is a UUID before
// interpolating it into the redirect target.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
