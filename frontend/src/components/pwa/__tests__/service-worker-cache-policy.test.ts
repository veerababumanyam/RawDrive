import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeGalleryCacheKey, offlineBucketName } from "../../../../public/service-worker-helpers.js";

// Helper: extract a named function body (lines between first `{` and matching `}`)
// from source text. Strips a leading `export ` so SW and helpers copies compare equal.
function extractFunctionBody(src: string, name: string): string {
  // Match `[export ]function NAME(...)` and capture the full declaration
  const declRe = new RegExp(`(?:export )?function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = declRe.exec(src);
  if (!match) throw new Error(`Could not find function ${name} in source`);
  let depth = 0;
  const start = match.index;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error(`Unmatched braces for function ${name}`);
  // Return from opening `{` to closing `}` inclusive, with `export ` stripped from declaration
  return src.slice(start, end + 1).replace(/^export\s+/, "");
}

// Helper: extract ONLY the inner body (between outermost `{` and `}`) for a named
// function. Used to compare TS and JS copies whose signatures differ (TS has type
// annotations, JS does not) but whose bodies must be identical.
function extractFunctionBodyOnly(src: string, name: string): string {
  const declRe = new RegExp(`(?:export )?function ${name}\\s*\\([^)]*\\)(?:[^{]*)?\\{`);
  const match = declRe.exec(src);
  if (!match) throw new Error(`Could not find function ${name} in source`);
  // Find the opening brace position
  const openBrace = match.index + match[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error(`Unmatched braces for function ${name}`);
  // Return the inner content (excluding the outermost `{` and `}`)
  return src.slice(openBrace + 1, end);
}

describe("service worker cache policy", () => {
  const source = readFileSync(join(process.cwd(), "public/service-worker.js"), "utf8");

  it("bypasses cache for security-critical worker scripts", () => {
    expect(source).toContain("isSecurityCriticalWorker(url)");
    expect(source).toContain("/upload-screening.worker");
    expect(source).toContain('cache: "no-store"');
  });

  it("does not intercept cross-origin gallery storage requests", () => {
    expect(source).toContain("url.origin !== self.location.origin");
  });

  it("returns a fallback response when same-origin gallery asset fetches fail uncached", () => {
    expect(source).toContain('cached || new Response("", { status: 504');
  });

  it("does not cache opaque image responses for CORS fetches", () => {
    expect(source).toContain('cached?.type === "opaque" && request.mode !== "no-cors"');
    expect(source).toContain('response.ok && response.type !== "opaque"');
    expect(source).not.toContain('response.ok || response.type === "opaque"');
  });

  it("does not let one failed precache URL reject service worker install", () => {
    expect(source).not.toContain("cache.addAll(PRECACHE_URLS)");
    expect(source).toContain("safePrecache(cache, PRECACHE_URLS)");
    expect(source).toContain("SW precache skipped:");
  });

  it("prefers the cached app document for /g/ offline nav, with the offline shell as cold-boot fallback", () => {
    // Precedence contract (supersedes Fix A): in handleNavigation's offline
    // `catch` block, /g/ navigations must prefer the cached Next document
    // (`caches.match(request)`) FIRST. That cached app document boots the React
    // app, which renders <OfflineGalleryView/> (catalog + Cache Storage) and
    // DECRYPTS encrypted galleries cache-first via useDecryptedAssetUrl using the
    // localStorage media key. The vanilla /offline-gallery.html shell is only the
    // COLD-BOOT fallback for when the app document itself was never cached (it has
    // no crypto pipeline and shows "open online" for encrypted galleries). So the
    // generic cached-document lookup must appear BEFORE the /g/ offline-shell.
    const catchBody = extractCatchBlock(source, "handleNavigation");

    // The /g/ guard still exists in the catch block...
    expect(catchBody).toContain('url.pathname.startsWith("/g/")');
    // ...and still serves the offline-gallery shell as the fallback there.
    expect(catchBody).toContain('"/offline-gallery.html"');

    // Precedence: the generic cached-document lookup appears BEFORE the /g/
    // offline-shell preference (inverted from the Fix A ordering).
    const galleryShellIdx = catchBody.indexOf("/offline-gallery.html");
    const genericCacheIdx = catchBody.indexOf("caches.match(request)");
    expect(galleryShellIdx).toBeGreaterThanOrEqual(0);
    expect(genericCacheIdx).toBeGreaterThanOrEqual(0);
    expect(genericCacheIdx).toBeLessThan(galleryShellIdx);
  });
});

// Helper: extract the source of the FIRST `try { ... } catch { ... }` block's
// catch clause inside a named function. Used to assert ordering of statements
// within handleNavigation's offline fallback.
function extractCatchBlock(src: string, fnName: string): string {
  const declRe = new RegExp(`(?:async )?function ${fnName}\\s*\\([^)]*\\)\\s*\\{`);
  const declMatch = declRe.exec(src);
  if (!declMatch) throw new Error(`Could not find function ${fnName} in source`);
  // Find the `catch` keyword after the function declaration.
  const catchKeyword = "} catch";
  const catchStart = src.indexOf(catchKeyword, declMatch.index);
  if (catchStart === -1) throw new Error(`Could not find catch block in ${fnName}`);
  // Find the opening brace of the catch clause.
  const openBrace = src.indexOf("{", catchStart + 1);
  if (openBrace === -1) throw new Error(`Could not find catch brace in ${fnName}`);
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error(`Unmatched braces for catch block in ${fnName}`);
  return src.slice(openBrace + 1, end);
}

describe("offline cache keying", () => {
  it("strips auth tokens from the cache key", () => {
    const a = normalizeGalleryCacheKey("https://x/storage/derivatives/1/display_webp.webp?at=AAA");
    const b = normalizeGalleryCacheKey("https://x/storage/derivatives/1/display_webp.webp?at=BBB");
    expect(a).toBe(b);
    expect(a).not.toContain("at=");
  });
  it("uses a stable, version-independent offline bucket name", () => {
    expect(offlineBucketName("g123")).toBe("rawdrive-offline-g123");
  });

  it("inline SW helper copies are byte-identical to service-worker-helpers.js (drift guard)", () => {
    const helpersSrc = readFileSync(join(process.cwd(), "public/service-worker-helpers.js"), "utf8");
    const swSrc = readFileSync(join(process.cwd(), "public/service-worker.js"), "utf8");

    // AUTH_QUERY_PARAMS line must be identical in both files
    const authLineRe = /const AUTH_QUERY_PARAMS = \[.*?\];/;
    const helpersAuthLine = authLineRe.exec(helpersSrc)?.[0];
    const swAuthLine = authLineRe.exec(swSrc)?.[0];
    expect(helpersAuthLine).toBeTruthy();
    expect(swAuthLine).toBe(helpersAuthLine);

    // normalizeGalleryCacheKey function body must be identical (export stripped)
    const helpersNormalize = extractFunctionBody(helpersSrc, "normalizeGalleryCacheKey");
    const swNormalize = extractFunctionBody(swSrc, "normalizeGalleryCacheKey");
    expect(swNormalize).toBe(helpersNormalize);

    // offlineBucketName function body must be identical (export stripped)
    const helpersBucket = extractFunctionBody(helpersSrc, "offlineBucketName");
    const swBucket = extractFunctionBody(swSrc, "offlineBucketName");
    expect(swBucket).toBe(helpersBucket);
  });

  it("cache-keys.ts function bodies match service-worker-helpers.js (drift guard)", () => {
    const helpersSrc = readFileSync(join(process.cwd(), "public/service-worker-helpers.js"), "utf8");
    const cacheKeysSrc = readFileSync(
      join(process.cwd(), "src/lib/offline/cache-keys.ts"),
      "utf8",
    );

    // AUTH_QUERY_PARAMS line must be identical (no TS-specific syntax on this line)
    const authLineRe = /const AUTH_QUERY_PARAMS = \[.*?\];/;
    const helpersAuthLine = authLineRe.exec(helpersSrc)?.[0];
    const cacheKeysAuthLine = authLineRe.exec(cacheKeysSrc)?.[0];
    expect(helpersAuthLine).toBeTruthy();
    expect(cacheKeysAuthLine).toBe(helpersAuthLine);

    // normalizeGalleryCacheKey inner body must be identical
    // (TS signature has type annotations; JS does not — compare bodies only)
    const helpersNormalizeBody = extractFunctionBodyOnly(helpersSrc, "normalizeGalleryCacheKey");
    const cacheKeysNormalizeBody = extractFunctionBodyOnly(cacheKeysSrc, "normalizeGalleryCacheKey");
    expect(cacheKeysNormalizeBody).toBe(helpersNormalizeBody);

    // offlineBucketName inner body must be identical
    const helpersBucketBody = extractFunctionBodyOnly(helpersSrc, "offlineBucketName");
    const cacheKeysBucketBody = extractFunctionBodyOnly(cacheKeysSrc, "offlineBucketName");
    expect(cacheKeysBucketBody).toBe(helpersBucketBody);
  });

  it("offline-gallery.html AUTH_QUERY_PARAMS matches service-worker-helpers.js (drift guard)", () => {
    // I2: offline-gallery.html is a 4th copy of AUTH_QUERY_PARAMS; ensure it
    // does not drift from the helpers-module definition.
    const helpersSrc = readFileSync(join(process.cwd(), "public/service-worker-helpers.js"), "utf8");
    const htmlSrc = readFileSync(join(process.cwd(), "public/offline-gallery.html"), "utf8");

    const authLineRe = /const AUTH_QUERY_PARAMS = \[.*?\];/;
    const helpersAuthLine = authLineRe.exec(helpersSrc)?.[0];
    const htmlAuthLine = authLineRe.exec(htmlSrc)?.[0];

    expect(helpersAuthLine).toBeTruthy();
    expect(htmlAuthLine).toBe(helpersAuthLine);
  });
});
