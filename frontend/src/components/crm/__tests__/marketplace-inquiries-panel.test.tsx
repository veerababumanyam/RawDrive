import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import type { MarketplaceInquiry } from "@/lib/api/marketplace";

// ---- Module mocks -----------------------------------------------------------
// The component pulls its data + identity from these two modules. We mock them
// so the test is a pure unit test with no network or storage dependency.
const listInquiries = vi.fn();
const replyToInquiry = vi.fn();

vi.mock("@/lib/api/marketplace", () => ({
  listInquiries: (...args: unknown[]) => listInquiries(...args),
  replyToInquiry: (...args: unknown[]) => replyToInquiry(...args),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-access-token",
  // currentUserID = claims.sub — the panel keeps only inquiries addressed to it.
  getStoredAccessTokenClaims: () => ({ sub: "user-123" }),
}));

import { MarketplaceInquiriesPanel } from "../marketplace-inquiries-panel";

function makeInquiry(
  overrides: Partial<MarketplaceInquiry> = {},
): MarketplaceInquiry {
  return {
    id: "inq-1",
    to_user_id: "user-123",
    from_user_id: "client-1",
    from_user_name: "Asha Rao",
    from_user_email: "asha@example.com",
    message: "Available for a December wedding?",
    status: "sent",
    created_at: "2026-01-10T10:00:00Z",
    ...overrides,
  } as MarketplaceInquiry;
}

/** A promise whose resolution we control by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MarketplaceInquiriesPanel", () => {
  beforeEach(() => {
    listInquiries.mockReset();
    replyToInquiry.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders inquiries addressed to the current user", async () => {
    listInquiries.mockResolvedValue([
      makeInquiry(),
      makeInquiry({
        id: "inq-2",
        to_user_id: "someone-else",
        from_user_name: "Other",
      }),
    ]);

    render(<MarketplaceInquiriesPanel />);

    await waitFor(() =>
      expect(screen.getByText("Asha Rao")).toBeInTheDocument(),
    );
    // The inquiry for a different to_user_id must be filtered out.
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(screen.getByText(/1 inquiry received/i)).toBeInTheDocument();
  });

  it("does not throw when the API resolves with null (latent null.filter guard)", async () => {
    // Before the fix, `data.filter(...)` threw on a null payload.
    listInquiries.mockResolvedValue(null as unknown as MarketplaceInquiry[]);

    render(<MarketplaceInquiriesPanel />);

    // Empty state is reached without an unhandled TypeError.
    await waitFor(() =>
      expect(
        screen.getByText(/No marketplace inquiries yet/i),
      ).toBeInTheDocument(),
    );
  });

  it("ignores an in-flight response that resolves after unmount (stale-closure guard)", async () => {
    // REGRESSION for F-096: without the `ignore` guard inside `load`, a request
    // that resolves after the component unmounts (or after a token refresh)
    // still calls setState, producing a React "state update on an unmounted
    // component" warning and a write into stale state.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<MarketplaceInquiry[]>();
    listInquiries.mockReturnValue(d.promise);

    const { unmount } = render(<MarketplaceInquiriesPanel />);

    // Request is in flight (still in the loading skeleton). Tear the component
    // down before it resolves — this runs the effect cleanup that flips `ignore`.
    unmount();

    // Now let the superseded request resolve.
    await act(async () => {
      d.resolve([makeInquiry()]);
      await d.promise;
    });

    // The guard must have swallowed the late resolve: no state-update warning.
    const sawStateUpdateWarning = errorSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          /unmounted|not wrapped in act|update.*state/i.test(a),
      ),
    );
    expect(sawStateUpdateWarning).toBe(false);
  });
});
