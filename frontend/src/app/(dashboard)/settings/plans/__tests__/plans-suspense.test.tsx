import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Regression test for F-048: useSearchParams() must sit inside a <Suspense>
// boundary (Next 15/16 requirement). Without the boundary, a client page that
// reads search params de-opts static prerendering / bails the whole route to
// CSR — and during static generation React throws when a component "suspends"
// outside of a Suspense boundary.
//
// We reproduce that behaviour deterministically: useSearchParams() suspends
// (throws a promise) on its first synchronous render, then resolves. If the
// default-export page does NOT wrap the search-param-reading content in
// <Suspense>, this render throws and the test fails. With the fix in place the
// Suspense fallback shows first, then the resolved content renders.

const pushMock = vi.fn();

// A one-shot resource that suspends on first read, exactly like Next's
// useSearchParams() does during prerender before params are available.
let resolved = false;
let pending: Promise<void> | null = null;

function suspendOnce() {
  if (resolved) return;
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve();
      }, 0);
    });
  }
  throw pending;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => {
    suspendOnce();
    return new URLSearchParams("");
  },
}));

// No auth token -> the page skips the subscription fetch and lands in the
// not-loading state, keeping the test free of network/DB concerns.
vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => null,
}));

import PlansPage from "../page";

afterEach(() => {
  vi.restoreAllMocks();
  resolved = false;
  pending = null;
});

describe("PlansPage (/settings/plans) Suspense boundary — F-048", () => {
  it("wraps useSearchParams in a Suspense boundary: shows fallback then content", async () => {
    // Before the fix this render throws (component suspends with no Suspense
    // ancestor). After the fix the fallback renders synchronously...
    render(<PlansPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    // ...and once the suspended search params resolve, the real page content
    // (the plan-selection heading) appears.
    await waitFor(() => {
      expect(screen.getByText("Choose a Plan")).toBeInTheDocument();
    });
  });
});
