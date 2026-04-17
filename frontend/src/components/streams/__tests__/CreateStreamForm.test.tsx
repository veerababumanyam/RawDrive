import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

// Mock authFetch so we can intercept the direct fetch call.
const authFetchMock = vi.fn();
vi.mock("@/lib/api/authFetch", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

// Keep streams mock for backward compat (unused after migration but
// prevents import errors).
vi.mock("@/lib/api/streams", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/api/streams");
  return { ...actual };
});

import { CreateStreamForm } from "../CreateStreamForm";

function fill(id: string, value: string) {
  const el = screen.getByTestId(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  fireEvent.change(el, { target: { value } });
}

describe("CreateStreamForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    authFetchMock.mockReset();
  });

  it("renders all expected fields", () => {
    render(<CreateStreamForm />);
    expect(screen.getByTestId("field-title")).toBeTruthy();
    expect(screen.getByTestId("field-description")).toBeTruthy();
    expect(screen.getByTestId("field-package_id")).toBeTruthy();
    expect(screen.getByTestId("field-expected_duration_minutes")).toBeTruthy();
    expect(screen.getByTestId("field-access_policy")).toBeTruthy();
    expect(screen.getByTestId("field-chat_policy")).toBeTruthy();
    expect(screen.getByTestId("field-calendar_event_url")).toBeTruthy();
    expect(screen.getByTestId("field-client_profile_id")).toBeTruthy();
    expect(screen.getByTestId("field-deal_link")).toBeTruthy();
    expect(screen.getByTestId("field-timezone")).toBeTruthy();
    expect(screen.getByTestId("submit-button")).toBeTruthy();
    expect(screen.getByTestId("reset-button")).toBeTruthy();
  });

  it("shows error when title is empty on submit", async () => {
    render(<CreateStreamForm />);
    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => {
      expect(screen.getByTestId("error-title")).toBeTruthy();
    });
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("shows error for invalid timezone string", async () => {
    render(<CreateStreamForm />);
    fill("field-title", "My Stream");
    fill("field-expected_duration_minutes", "60");
    fill("field-timezone", "Not/A_Zone");
    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => {
      expect(screen.getByTestId("error-timezone")).toBeTruthy();
    });
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("shows error for invalid calendar URL and deal_link URL", async () => {
    render(<CreateStreamForm />);
    fill("field-title", "My Stream");
    fill("field-expected_duration_minutes", "60");
    fill("field-calendar_event_url", "not a url");
    fill("field-deal_link", "also-bad");
    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => {
      expect(screen.getByTestId("error-calendar_event_url")).toBeTruthy();
      expect(screen.getByTestId("error-deal_link")).toBeTruthy();
    });
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("submits with correct payload shape and navigates on 201", async () => {
    authFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "stream-123" }),
    });

    render(<CreateStreamForm />);
    fill("field-title", "Sharma-Patel Wedding");
    fill("field-description", "Live coverage");
    fill("field-package_id", "pkg-basic");
    fill("field-expected_duration_minutes", "90");
    fill("field-access_policy", "pin");
    fill("field-chat_policy", "authenticated");
    fill("field-calendar_event_url", "https://cal.example.com/e/1");
    fill("field-client_profile_id", "client-9");
    fill("field-deal_link", "https://deals.example.com/42");
    fill("field-timezone", "Asia/Kolkata");

    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = authFetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/streams");
    expect(options.method).toBe("POST");
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({
      title: "Sharma-Patel Wedding",
      description: "Live coverage",
      package_id: "pkg-basic",
      expected_duration_minutes: 90,
      access_policy: "pin",
      chat_policy: "authenticated",
      calendar_event_url: "https://cal.example.com/e/1",
      client_profile_id: "client-9",
      deal_link: "https://deals.example.com/42",
      timezone: "Asia/Kolkata",
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/streams/stream-123/invite");
    });
  });

  it("shows top up credits CTA on 402 insufficient credits", async () => {
    authFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: () => Promise.resolve({ error: "insufficient credits" }),
    });

    render(<CreateStreamForm />);
    fill("field-title", "Short Stream");
    fill("field-expected_duration_minutes", "30");
    fill("field-timezone", "Asia/Kolkata");
    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("top-up-credits-cta")).toBeTruthy();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
