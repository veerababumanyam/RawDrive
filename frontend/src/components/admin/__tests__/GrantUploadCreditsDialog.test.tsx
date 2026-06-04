import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { GrantUploadCreditsDialog } from "../GrantUploadCreditsDialog";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

// The API helper reads the token via getStoredAccessToken(), which
// reads from the in-memory cache seeded by persistAuthTokens. Mirror
// the real login flow here so the Authorization header assertion
// behaves like production.
beforeEach(() => {
  persistAuthTokens("test-token");
  // Ensure crypto.randomUUID is available in JSDOM so the dialog's
  // idempotency-key generator doesn't fall through to the Date.now
  // fallback (we want to assert the real UUID shape below).
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    });
  }
});

afterEach(() => {
  clearAuthTokens();
  vi.restoreAllMocks();
});

const WS_ID = "00000000-0000-0000-0000-000000000abc";
const WS_NAME = "Acme Studios";

describe("GrantUploadCreditsDialog", () => {
  it("renders the workspace name + inputs when open", () => {
    render(
      <GrantUploadCreditsDialog
        open={true}
        onClose={() => {}}
        workspaceId={WS_ID}
        workspaceName={WS_NAME}
      />,
    );
    expect(screen.getByText(/Granting to/i).textContent).toContain(WS_NAME);
    expect(screen.getByTestId("grant-upload-credits-amount")).toBeDefined();
    expect(screen.getByTestId("grant-upload-credits-reason")).toBeDefined();
    expect(screen.getByTestId("grant-upload-credits-submit")).toBeDefined();
  });

  it("returns null when open=false", () => {
    const { container } = render(
      <GrantUploadCreditsDialog
        open={false}
        onClose={() => {}}
        workspaceId={WS_ID}
        workspaceName={WS_NAME}
      />,
    );
    expect(
      container.querySelector("[data-testid='grant-upload-credits-dialog']"),
    ).toBeNull();
  });

  it("POSTs to the admin grant endpoint and shows success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ledger_entry_id: "entry-42",
        workspace_id: WS_ID,
        amount_credits: 500,
        idempotency_key: "ignored",
        created_at: "2026-04-21T10:00:00Z",
      }),
    } as Response);
    global.fetch = fetchSpy;

    const onGranted = vi.fn();
    render(
      <GrantUploadCreditsDialog
        open={true}
        onClose={() => {}}
        workspaceId={WS_ID}
        workspaceName={WS_NAME}
        onGranted={onGranted}
      />,
    );

    fireEvent.change(screen.getByTestId("grant-upload-credits-amount"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByTestId("grant-upload-credits-reason"), {
      target: { value: "Onboarding bonus for Acme" },
    });
    fireEvent.click(screen.getByTestId("grant-upload-credits-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("grant-upload-credits-success")).toBeDefined();
    });
    expect(onGranted).toHaveBeenCalledWith(500);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(
      `/api/v1/admin/workspaces/${WS_ID}/upload-credits/grant`,
    );
    expect(init?.method).toBe("POST");
    // Authorization must be the persisted test-token, not empty.
    const auth = (init?.headers as Record<string, string> | undefined)?.[
      "Authorization"
    ];
    expect(auth).toBe("Bearer test-token");
    const body = JSON.parse(init?.body as string);
    expect(body.amount_credits).toBe(500);
    expect(body.reason).toBe("Onboarding bonus for Acme");
    // idempotency_key must be non-empty — the backend partial-unique index
    // relies on (workspace_id, idempotency_key) to make double-submits safe.
    expect(typeof body.idempotency_key).toBe("string");
    expect(body.idempotency_key.length).toBeGreaterThan(0);
  });

  it("surfaces the GRANT_CAP_EXCEEDED error from the structured envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error_code: "GRANT_CAP_EXCEEDED",
        error: "amount exceeds per-grant hard cap (100000)",
      }),
    } as Response);

    render(
      <GrantUploadCreditsDialog
        open={true}
        onClose={() => {}}
        workspaceId={WS_ID}
        workspaceName={WS_NAME}
      />,
    );

    fireEvent.change(screen.getByTestId("grant-upload-credits-amount"), {
      target: { value: "99999" },
    });
    fireEvent.change(screen.getByTestId("grant-upload-credits-reason"), {
      target: { value: "Too big" },
    });
    fireEvent.click(screen.getByTestId("grant-upload-credits-submit"));

    await waitFor(() => {
      const err = screen.getByTestId("grant-upload-credits-error");
      expect(err.textContent).toMatch(/per-grant cap/i);
    });
  });

  it("disables submit until amount + reason are both valid", () => {
    render(
      <GrantUploadCreditsDialog
        open={true}
        onClose={() => {}}
        workspaceId={WS_ID}
        workspaceName={WS_NAME}
      />,
    );
    const submit = screen.getByTestId(
      "grant-upload-credits-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("grant-upload-credits-amount"), {
      target: { value: "100" },
    });
    // Reason still empty
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("grant-upload-credits-reason"), {
      target: { value: "  " }, // whitespace only — trim rejects
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("grant-upload-credits-reason"), {
      target: { value: "Valid reason" },
    });
    expect(submit.disabled).toBe(false);

    // Over-cap amount (100001) must disable again — the backend would 422
    // anyway, but blocking client-side avoids wasted round-trips.
    fireEvent.change(screen.getByTestId("grant-upload-credits-amount"), {
      target: { value: "100001" },
    });
    expect(submit.disabled).toBe(true);
  });
});
