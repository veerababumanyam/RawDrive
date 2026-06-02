interface ApiBaseEnv {
  INTERNAL_API_BASE_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  [key: string]: string | undefined;
}

interface ResolveApiBaseUrlOptions {
  isServer?: boolean;
  env?: ApiBaseEnv;
}

export function resolveApiBaseUrl({
  isServer = typeof window === "undefined",
  env = process.env,
}: ResolveApiBaseUrlOptions = {}): string {
  if (isServer) {
    return env.INTERNAL_API_BASE_URL || env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  }
  return env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}
