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
//     const upload = useUpload(apiUrl, token);
//
// The gallery page re-renders frequently while uploads are in flight
// (per-byte progress state updates), so that render-body call fired the 4
// main-thread storage writes on every progress tick — the most
// performance-sensitive UX window.
//
// The fix snapshots the token ONCE per mount via useRef so the read does
// not repeat on re-render:
//
//     const tokenRef = useRef<string | null>(null);
//     if (tokenRef.current === null) tokenRef.current = getStoredAccessToken();
//     const token = tokenRef.current;
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

  it("snapshots the access token with a useRef initializer for the upload hook", () => {
    const source = readDetailPage();

    // A useRef-based one-time snapshot must back the token passed to
    // useUpload: a null-initialized ref, a guarded one-time assignment
    // from getStoredAccessToken(), and `token` resolving to the ref's
    // current value.
    expect(source).toMatch(/const tokenRef = useRef<string \| null>\(null\);/);
    expect(source).toMatch(
      /if \(tokenRef\.current === null\) \{\s*\n\s*tokenRef\.current = getStoredAccessToken\(\);/,
    );
    expect(source).toMatch(/const token = tokenRef\.current;/);

    // And that snapshot must be the value handed to the upload hook.
    expect(source).toMatch(/const upload = useUpload\(apiUrl, token\);/);
  });
});
