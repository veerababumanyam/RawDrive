import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CreditPill } from "../CreditPill";

function mockBalance(partial: Partial<{ balance_minutes: number; balance_paise: number; low_balance: boolean }> = {}) {
  return {
    workspace_id: "ws-1",
    balance_paise: 100000,
    balance_minutes: 120,
    last_entry_at: "2026-04-14T00:00:00.000Z",
    low_balance: false,
    ...partial,
  };
}

describe("CreditPill", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders balance minutes once fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance({ balance_minutes: 120 }),
    }) as unknown as Response));

    render(<CreditPill />);
    await waitFor(() => {
      expect(screen.getByTestId("credit-pill-minutes").textContent).toMatch(/120/);
    });
  });

  it("applies low-balance warning variant when low_balance=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance({ balance_minutes: 10, low_balance: true }),
    }) as unknown as Response));

    render(<CreditPill />);
    await waitFor(() => {
      expect(screen.getByTestId("credit-pill")).toHaveAttribute("data-low-balance", "true");
    });
  });

  it("opens RechargeModal when pill is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/public/streaming/packages")) {
        return { ok: true, status: 200, json: async () => ({ packages: [] }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => mockBalance() } as unknown as Response;
    }));

    render(<CreditPill />);
    await waitFor(() => screen.getByTestId("credit-pill-button"));

    fireEvent.click(screen.getByTestId("credit-pill-button"));
    await waitFor(() => {
      expect(screen.getByTestId("recharge-modal")).toBeTruthy();
    });
  });
});
