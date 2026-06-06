import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

const BASE_DOMAIN = "rawdrive.in";

const SYSTEM_SUBDOMAINS = new Set(["www", "api", "cdn"]);

export function isDisabledRawDriveSubdomain(host: string | null): boolean {
  if (!host) return false;
  const lower = host.toLowerCase().split(":")[0];

  if (!lower.endsWith(`.${BASE_DOMAIN}`)) return false;

  const sub = lower.slice(0, -(BASE_DOMAIN.length + 1));
  if (sub === "" || sub.includes(".")) return false;
  return !SYSTEM_SUBDOMAINS.has(sub);
}

// F-098: a fresh per-request nonce lets the CSP drop 'unsafe-inline' from
// script-src. Edge-runtime safe — uses Web Crypto + btoa (no node: APIs).
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function middleware(req: NextRequest) {
  // F-098: build the nonced CSP once per request. The nonce is forwarded on the
  // REQUEST headers so Next.js stamps it onto its framework/bootstrap scripts
  // (and layout.tsx reads x-nonce for the theme-init <Script>); the same policy
  // is set on the RESPONSE for browser enforcement. Applied to every return path
  // via pass()/the rewrite below.
  const isDev = process.env.NODE_ENV !== "production";
  const isLocalBrowser =
    req.nextUrl.hostname === "localhost" ||
    req.nextUrl.hostname === "127.0.0.1" ||
    req.nextUrl.hostname === "::1";
  const apiOrigin =
    process.env.NEXT_PUBLIC_API_URL ||
    (isLocalBrowser ? "http://localhost:8080" : "");
  const nonce = generateNonce();
  const csp = buildCsp({ isDev, nonce, apiOrigin });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Forward the request (carrying the nonce) and stamp the CSP on the response.
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (isDisabledRawDriveSubdomain(req.headers.get("host"))) {
    const res = new NextResponse("RawDrive studio subdomains are disabled.", {
      status: 410,
    });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  return pass();
}

export const config = {
  matcher: [
    // Skip generated assets and every extension-bearing public asset. Gallery
    // slugs are generated without dots, so extension paths are static files,
    // not gallery routes.
    "/((?!_next/static|_next/image|.*\\.[^/]+$).*)",
  ],
};
