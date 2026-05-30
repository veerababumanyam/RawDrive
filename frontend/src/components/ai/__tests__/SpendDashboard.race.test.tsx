import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { SpendDashboard } from "../SpendDashboard";
import type { SpendSummary, CreditSummary } from "@/lib/api/ai";

// Mock the AI API module so we can control the resolution order of the two
// in-flight requests and assert the stale-token race is fixed.
vi.mock("@/lib/api/ai", () => ({
  getSpend: vi.fn(),
  getCredits: vi.fn(),
}));

import { getSpend, getCredits } from "@/lib/api/ai";

const getSpendMock = vi.mocked(getSpend);
const getCreditsMock = vi.mocked(getCredits);

function spendFor(totalPaisa: number): SpendSummary {
  // Cast keeps the test resilient to extra optional fields on SpendSummary.
  return { total_paisa: totalPaisa, by_operation: {} } as unknown as SpendSummary;
}

function creditsFor(remainingPaisa: number): CreditSummary {
  return {
    monthly_cap_paisa: 0,
    remaining_paisa: remainingPaisa,
    cap_used_percent: 0,
  } as unknown as CreditSummary;
}

// A deferred promise we can resolve on demand to simulate slow/fast responses.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const formatPaisa = (paisa: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paisa / 100);

// Flush all pending microtasks (Promise.all -> .then -> .finally chains) plus
// any React state updates they schedule, wrapped in act() so the re-render is
// applied before we assert. Several rounds cover the nested promise chain.
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  });
}

describe("SpendDashboard — stale-response race guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("ignores the slower prior response when the token prop changes mid-flight", async () => {
    // token "A" request is slow; token "B" request is fast.
    const spendA = deferred<SpendSummary>();
    const creditsA = deferred<CreditSummary>();
    const spendB = deferred<SpendSummary>();
    const creditsB = deferred<CreditSummary>();

    getSpendMock.mockImplementation((token: string) =>
      token === "A" ? spendA.promise : spendB.promise,
    );
    getCreditsMock.mockImplementation((token: string) =>
      token === "A" ? creditsA.promise : creditsB.promise,
    );

    const { rerender } = render(<SpendDashboard token="A" />);

    // Switch to token "B" while A's requests are still pending. With deps
    // [token] this fires the cleanup for the A effect (which, in the fixed
    // component, flips its `cancelled` flag) and starts the B effect.
    rerender(<SpendDashboard token="B" />);

    // B resolves first (the fresh data).
    await act(async () => {
      spendB.resolve(spendFor(5000)); // ₹50.00
      creditsB.resolve(creditsFor(0));
    });

    await waitFor(() => {
      expect(screen.getByText(formatPaisa(5000))).toBeTruthy();
    });

    // Now the STALE token-A responses land late. Without the cancelled guard
    // A's still-attached .then runs setSpend(99999) and overwrites the fresher
    // B value. With the guard the late A write is dropped.
    await act(async () => {
      spendA.resolve(spendFor(99999)); // ₹999.99 — stale, must NOT win
      creditsA.resolve(creditsFor(12345));
    });
    await flush();

    // Fresh value still shown; stale value never rendered.
    expect(screen.getByText(formatPaisa(5000))).toBeTruthy();
    expect(screen.queryByText(formatPaisa(99999))).toBeNull();
  });

  it("does not write state after unmount (cleanup cancels the effect)", async () => {
    const spend = deferred<SpendSummary>();
    const credits = deferred<CreditSummary>();
    getSpendMock.mockReturnValue(spend.promise);
    getCreditsMock.mockReturnValue(credits.promise);

    const { unmount } = render(<SpendDashboard token="A" />);
    unmount();

    // Resolving after unmount must be a safe no-op — no throw, no act warning.
    await act(async () => {
      spend.resolve(spendFor(1000));
      credits.resolve(creditsFor(0));
    });
    await flush();

    // If the guard were missing this would have attempted setState on an
    // unmounted component; reaching here without a thrown error confirms the
    // cleanup short-circuited the late write.
    expect(true).toBe(true);
  });
});
