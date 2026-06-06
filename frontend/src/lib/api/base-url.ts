interface ApiBaseEnv {
  INTERNAL_API_BASE_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  [key: string]: string | undefined;
}

interface ResolveApiBaseUrlOptions {
  isServer?: boolean;
  env?: ApiBaseEnv;
  locationHostname?: string;
}

const LOCAL_API_BASE_URL = "http://localhost:8080";
const PRODUCTION_API_BASE_URL = "https://api.rawdrive.in";

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

function currentBrowserHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

function apiUrlPointsAtLocalhost(value: string): boolean {
  try {
    const parsed = new URL(value);
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl({
  isServer = typeof window === "undefined",
  env = process.env,
  locationHostname,
}: ResolveApiBaseUrlOptions = {}): string {
  if (isServer) {
    return (
      env.INTERNAL_API_BASE_URL ||
      env.NEXT_PUBLIC_API_URL ||
      LOCAL_API_BASE_URL
    );
  }

  const hostname = locationHostname || currentBrowserHostname();
  if (env.NEXT_PUBLIC_API_URL) {
    if (
      hostname &&
      !isLocalHostname(hostname) &&
      apiUrlPointsAtLocalhost(env.NEXT_PUBLIC_API_URL)
    ) {
      return PRODUCTION_API_BASE_URL;
    }
    return env.NEXT_PUBLIC_API_URL;
  }

  if (hostname && !isLocalHostname(hostname)) {
    return PRODUCTION_API_BASE_URL;
  }
  return LOCAL_API_BASE_URL;
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}
