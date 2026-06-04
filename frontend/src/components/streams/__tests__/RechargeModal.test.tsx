import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RechargeModal } from "../RechargeModal";

const fakePackages = [
  {
    id: "pkg-basic",
    code: "basic-60",
    name: "Basic 60",
    tier: "basic",
    minutes: 60,
    max_concurrent_viewers: 100,
    replay_ttl_days: 7,
    price_paise: 49900,
    base_rate_paise_per_min: 800,
    overage_rate_paise_per_min: 1200,
  },
  {
    id: "pkg-pro",
    code: "pro-180",
    name: "Pro 180",
    tier: "pro",
    minutes: 180,
    max_concurrent_viewers: 500,
    replay_ttl_days: 30,
    price_paise: 129900,
    base_rate_paise_per_min: 700,
    overage_rate_paise_per_min: 1100,
  },
];

function stubFetch(handlers: {
  packages?: { ok: boolean; body: unknown };
  recharge?: { ok: boolean; body: unknown; status?: number };
}) {
  return vi.fn(async (input: RequestInfo, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/public/streaming/packages")) {
      const h = handlers.packages ?? {
        ok: true,
        body: { packages: fakePackages },
      };
      return {
        ok: h.ok,
        status: h.ok ? 200 : 500,
        json: async () => h.body,
      } as unknown as Response;
    }
    if (url.includes("/streaming/recharge")) {
      const h = handlers.recharge ?? {
        ok: true,
        body: { order_id: "o-1", checkout_url: "https://checkout.example/123" },
      };
      return {
        ok: h.ok,
        status: h.status ?? (h.ok ? 200 : 400),
        json: async () => h.body,
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;
  });
}

describe("RechargeModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the package list on open", async () => {
    vi.stubGlobal("fetch", stubFetch({}));

    render(<RechargeModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("package-pkg-basic")).toBeTruthy();
      expect(screen.getByTestId("package-pkg-pro")).toBeTruthy();
    });
  });

  it("returns null when closed", () => {
    const { container } = render(
      <RechargeModal open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("submits selected package and calls onRedirect with the URL", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        recharge: {
          ok: true,
          body: {
            order_id: "o-42",
            checkout_url: "https://checkout.example/42",
          },
        },
      }),
    );
    const onRedirect = vi.fn();
    const onClose = vi.fn();

    render(<RechargeModal open onClose={onClose} onRedirect={onRedirect} />);
    await waitFor(() => screen.getByTestId("package-pkg-basic"));

    fireEvent.click(screen.getByTestId("package-pkg-basic"));
    fireEvent.click(screen.getByTestId("recharge-submit"));

    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith("https://checkout.example/42");
    });
  });

  it("falls back to redirect_url for older recharge responses", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        recharge: {
          ok: true,
          body: {
            order_id: "o-43",
            redirect_url: "https://checkout.example/43",
          },
        },
      }),
    );
    const onRedirect = vi.fn();

    render(<RechargeModal open onClose={() => {}} onRedirect={onRedirect} />);
    await waitFor(() => screen.getByTestId("package-pkg-basic"));

    fireEvent.click(screen.getByTestId("package-pkg-basic"));
    fireEvent.click(screen.getByTestId("recharge-submit"));

    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith("https://checkout.example/43");
    });
  });

  it("submit is disabled with no package selected", async () => {
    vi.stubGlobal("fetch", stubFetch({}));
    render(<RechargeModal open onClose={() => {}} />);
    await waitFor(() => screen.getByTestId("package-pkg-basic"));
    const btn = screen.getByTestId("recharge-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows an error and does not redirect on recharge failure", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        recharge: { ok: false, status: 400, body: { error: "insufficient" } },
      }),
    );
    const onRedirect = vi.fn();
    render(<RechargeModal open onClose={() => {}} onRedirect={onRedirect} />);
    await waitFor(() => screen.getByTestId("package-pkg-basic"));
    fireEvent.click(screen.getByTestId("package-pkg-basic"));
    fireEvent.click(screen.getByTestId("recharge-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("recharge-error")).toBeTruthy();
    });
    expect(onRedirect).not.toHaveBeenCalled();
  });
});
