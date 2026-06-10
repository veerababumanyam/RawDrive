import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// F-089 regression test (source-static).
//
// getStoredAccessToken() is NOT a pure getter: lib/auth.ts has it call
// clearLegacyStoredTokens(), which performs 4 synchronous storage
// removeItem() writes (2 legacy keys × localStorage+sessionStorage) on
// EVERY call. The bug (F-089) was that galleries/[id]/page.tsx read the
// access token inline in the component RENDER BODY at the upload
// integration site:
//
//     const token = getStoredAccessToken();
//     const upload = useUpload(apiUrl, token, ...);
//
// The gallery page re-renders frequently while uploads are in flight
// (per-byte progress state updates), so that render-body call fired the 4
// main-thread storage writes on every progress tick — the most
// performance-sensitive UX window.
//
// The fix snapshots the token ONCE per mount via a lazy useState
// initializer so the read does not repeat on re-render:
//
//     const [token] = useState<string | null>(() => getStoredAccessToken());
//
// (The earlier useRef form — a null-initialized ref assigned once during
// render — was equivalent but reads/writes a ref during render, which the
// React Compiler lint rule react-hooks/refs forbids; the lazy useState
// initializer has the same once-per-mount semantics and is rule-clean.)
//
// This test mirrors the established static-source style already used in
// this directory (gallery-detail-perf-a11y.test.ts covers F-043/F-045/
// F-046/F-047 the same way). It is deterministic, needs no render harness
// or effect-timing assumptions, fails against the pre-fix source, and
// passes after the fix.

const repoRoot = path.resolve(__dirname, "../../../../..");
const detailPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/page.tsx",
);

function readDetailPage(): string {
  return fs.readFileSync(detailPagePath, "utf8");
}

describe("F-089: gallery detail page reads the access token once per mount", () => {
  it("does not read the token inline in the render body at the upload-integration site", () => {
    const source = readDetailPage();

    // The exact pre-fix render-body pattern (inline read immediately
    // feeding useUpload) must be gone.
    expect(source).not.toMatch(
      /const token = getStoredAccessToken\(\);\s*\n\s*const upload = useUpload\(/,
    );
  });

  it("snapshots the access token with a lazy useState initializer for the upload hook", () => {
    const source = readDetailPage();

    // A once-per-mount snapshot must back the token passed to useUpload: a
    // lazy useState initializer that calls getStoredAccessToken() exactly
    // once at mount (never on re-render). The earlier useRef form was
    // replaced because reading/writing a ref during render trips the React
    // Compiler rule react-hooks/refs; the lazy initializer is equivalent.
    expect(source).toMatch(
      /const \[token\] = useState<string \| null>\(\(\) => getStoredAccessToken\(\)\);/,
    );

    // And that snapshot must be the value handed to the upload hook. The hook
    // now takes a single options object that carries BOTH the client-side
    // media-encryption key provider (feature branch) AND the S3-G4 destination
    // binding (galleryId / albumId, server-side gallery linkage), so the call
    // spans multiple lines. The gallery detail page now prefers the
    // dashboard-level upload queue so uploads can survive route changes, but
    // the isolated local fallback must still be backed by the once-per-mount
    // token snapshot.
    expect(source).toMatch(/const localUpload = useUpload\(apiUrl, token, \{/);
    expect(source).toMatch(/encryption: uploadEncryption,/);
    expect(source).toContain("const upload = dashboardUpload ?? localUpload");

    // And that the same call still allows trailing args after `token` (the
    // S3-G4 destination binding) while pinning the `token` snapshot as the
    // value that feeds useUpload.
    expect(source).toMatch(
      /const localUpload = useUpload\(apiUrl, token(,| \)|\))/,
    );
  });
});
