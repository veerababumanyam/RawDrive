import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DeliveryContinuityPanel } from "../delivery-continuity-panel";

describe("DeliveryContinuityPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        views: 42,
        unique_visitors: 17,
        downloads: 9,
        favorites: 3,
        shares: 1,
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders download and view counts from the analytics summary API", async () => {
    render(
      <DeliveryContinuityPanel
        galleryId="g-1"
        token="t-1"
        selectedCount={2}
        totalCount={10}
      />,
    );
    await waitFor(() => expect(screen.getByText("9")).toBeInTheDocument());
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("2 of 10 selected")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/g-1/analytics/summary"),
      expect.objectContaining({ headers: { Authorization: "Bearer t-1" } }),
    );
  });

  it("marks proofing as complete when selectedCount >= totalCount", async () => {
    render(
      <DeliveryContinuityPanel
        galleryId="g-1"
        token="t-1"
        selectedCount={10}
        totalCount={10}
      />,
    );
    expect(screen.getByText("10 of 10 selected")).toBeInTheDocument();
  });

  it("reports proofing-not-started when totalCount is 0", () => {
    render(
      <DeliveryContinuityPanel
        galleryId="g-1"
        token="t-1"
        selectedCount={0}
        totalCount={0}
      />,
    );
    expect(screen.getByText("Proofing not started")).toBeInTheDocument();
  });

  it("surfaces an error string when the analytics fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    render(
      <DeliveryContinuityPanel
        galleryId="g-1"
        token="t-1"
        selectedCount={0}
        totalCount={0}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Failed to get analytics/i)).toBeInTheDocument(),
    );
  });
});
