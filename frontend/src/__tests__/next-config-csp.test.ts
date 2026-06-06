/**
 * Regression test for F-098 — "Production CSP carries 'unsafe-inline' in
 * script-src".
 *
 * The Content-Security-Policy is built from one exported `buildCsp()` helper
 * (src/lib/csp.ts) shared by the per-request middleware (src/middleware.ts) and
 * — historically — the static next.config.ts header. That gives ONE typed
 * definition of the policy and makes the nonce-based hardening a single switch:
 * when a per-request nonce is supplied, script-src drops 'unsafe-inline' and
 * uses 'nonce-...' + 'strict-dynamic'. The static next.config.ts header has now
 * been removed so the nonced middleware policy is the only CSP on HTML routes;
 * the no-nonce branch below remains buildCsp's documented fallback contract.
 *
 * Assertions are scoped to the script-src directive specifically — the finding
 * is script-src only. style-src legitimately keeps 'unsafe-inline' (Tailwind v4
 * + inline styles, which cannot execute) and is out of scope for F-098.
 *
 *   1. NONCE path (what the middleware follow-up will pass) MUST drop
 *      'unsafe-inline' from script-src and emit 'nonce-<value>'. This is the
 *      contract that actually closes F-098.
 *   2. STATIC-header path (no nonce, what next.config.ts emits today) keeps the
 *      hardened baseline and the Razorpay source. This locks the live header so
 *      a future edit cannot silently weaken it further, and documents that the
 *      static path's residual 'unsafe-inline' is by design until middleware
 *      threads a nonce.
 *
 * Verifying the live wire header end-to-end requires running the app and reading
 * the response header (a static next.config.ts header cannot carry a per-request
 * nonce). This unit test guards the policy builder that next.config.ts consumes,
 * which is the smallest reliable regression surface.
 */
import { describe, it, expect } from "vitest";
import { buildCsp } from "../lib/csp";

/** Extract just the `script-src ...` directive from a full CSP string. */
function scriptSrc(csp: string): string {
  return directive(csp, "script-src");
}

function directive(csp: string, name: string): string {
  const directive = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(name));
  if (!directive) throw new Error(`no ${name} directive in CSP: ${csp}`);
  return directive;
}

describe("next.config CSP (F-098)", () => {
  it("nonce path DROPS 'unsafe-inline' from script-src and uses a nonce", () => {
    const nonce = "dGVzdC1ub25jZS12YWx1ZQ=="; // arbitrary base64-ish token
    const script = scriptSrc(buildCsp({ isDev: false, nonce }));

    // The core F-098 fix contract: with a nonce, script-src must NOT allow
    // arbitrary inline scripts.
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).toContain("'strict-dynamic'");
    // The WebP upload fallback is WebAssembly-based; allow WASM compilation
    // without enabling broad JavaScript eval in production.
    expect(script).toContain("'wasm-unsafe-eval'");
    // The Razorpay allowance and 'self' must survive the nonce switch.
    expect(script).toContain("'self'");
    expect(script).toContain("https://checkout.razorpay.com");
    expect(script).toContain("https://www.instagram.com");
    // prod must never enable unsafe-eval.
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("static-header path keeps the hardened baseline and Razorpay source", () => {
    // buildCsp's no-nonce fallback contract (prod build). This branch is no
    // longer emitted as a static header, but is kept as the documented default.
    const csp = buildCsp({ isDev: false, apiOrigin: "" });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    const script = scriptSrc(csp);
    expect(script).toContain("'self'");
    expect(script).toContain("https://checkout.razorpay.com");
    expect(script).toContain("https://www.instagram.com");
    expect(script).toContain("'wasm-unsafe-eval'");
    // No nonce supplied -> the static header cannot carry one, so this path
    // still falls back to 'unsafe-inline'. (Removing it for real is the
    // middleware nonce follow-up — see manualActionNeeded in the fix report.)
    expect(script).toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("dev still adds 'unsafe-eval' (turbopack/react-refresh need it)", () => {
    const devScript = scriptSrc(buildCsp({ isDev: true }));
    expect(devScript).toContain("'unsafe-eval'");
  });

  it("allows the configured API origin for API-backed gallery media", () => {
    const csp = buildCsp({
      isDev: false,
      nonce: "abc",
      apiOrigin: "http://localhost:8080/api/v1",
    });

    expect(directive(csp, "img-src")).toContain("http://localhost:8080");
    expect(directive(csp, "connect-src")).toContain("http://localhost:8080");
    expect(directive(csp, "media-src")).toContain("http://localhost:8080");
    expect(csp).not.toContain("/api/v1");
  });

  it("allows Instagram embeds without reintroducing unsafe inline scripts", () => {
    const csp = buildCsp({ isDev: false, nonce: "abc" });

    expect(scriptSrc(csp)).toContain("https://www.instagram.com");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(directive(csp, "frame-src")).toContain("https://www.instagram.com");
  });
});
