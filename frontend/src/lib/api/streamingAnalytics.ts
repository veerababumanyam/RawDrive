import { getApiBaseUrl } from "@/lib/api/base-url";
// M35 / F-014 story 35-6 — Streaming analytics API client.
// Mirrors backend StreamMetrics + WorkspaceMetrics JSON shapes.

const API_BASE = getApiBaseUrl();

export interface ConversionBucketsDTO {
  qr: number;
  wa: number;
  email: number;
  invite: number;
  direct: number;
}

export interface StreamMetricsDTO {
  streamId: string;
  peakViewers: number;
  uniqueViewers: number;
  watchTimeSec: number;
  avgWatchTimeSec: number;
  chatMessages: number;
  chatMsgsPerMin: number;
  reactions: number;
  replayViews: number;
  conversionBySrc: ConversionBucketsDTO;
  sampledAt: string;
}

export interface TopStreamDTO {
  id: string;
  title: string;
  peakViewers: number;
  watchTimeSec: number;
  chatMessages: number;
  endedAt?: string;
}

export interface DayCreditsDTO {
  date: string;
  credits: number;
}

export interface WorkspaceMetricsDTO {
  month: string; // YYYY-MM
  streamsCount: number;
  creditsConsumed: number;
  topStreams: TopStreamDTO[];
  byDayCredits: DayCreditsDTO[];
}

export type AnalyticsFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class AnalyticsAccessError extends Error {
  status: number;
  constructor(status: number) {
    super(status === 403 || status === 404 ? "forbidden" : `analytics_error_${status}`);
    this.status = status;
  }
}

function authHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchStreamAnalytics(
  streamId: string,
  opts: { token?: string; fetcher?: AnalyticsFetcher } = {},
): Promise<StreamMetricsDTO> {
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(
    `${API_BASE}/api/v1/streaming/streams/${encodeURIComponent(streamId)}/analytics`,
    { headers: authHeaders(opts.token) },
  );
  if (!res.ok) throw new AnalyticsAccessError(res.status);
  return (await res.json()) as StreamMetricsDTO;
}

export async function fetchWorkspaceAnalytics(
  month?: string,
  opts: { token?: string; fetcher?: AnalyticsFetcher } = {},
): Promise<WorkspaceMetricsDTO> {
  const fetcher = opts.fetcher ?? fetch;
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetcher(
    `${API_BASE}/api/v1/streaming/workspace/analytics${qs}`,
    { headers: authHeaders(opts.token) },
  );
  if (!res.ok) throw new AnalyticsAccessError(res.status);
  return (await res.json()) as WorkspaceMetricsDTO;
}
