import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FaceClusterBrowser } from "../FaceClusterBrowser";

vi.mock("@/lib/api/ai", () => ({
  getFaceClusters: vi.fn(),
  renameCluster: vi.fn(),
}));

import { getFaceClusters } from "@/lib/api/ai";

const mockGetFaceClusters = vi.mocked(getFaceClusters);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FaceClusterBrowser", () => {
  it("shows loading spinner initially", () => {
    mockGetFaceClusters.mockReturnValue(new Promise(() => {}));
    render(<FaceClusterBrowser token="test" />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows empty state when no clusters", async () => {
    mockGetFaceClusters.mockResolvedValue([]);
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByText(/No people detected/)).toBeTruthy();
    });
  });

  it("distinguishes a fetch error from the empty state", async () => {
    mockGetFaceClusters.mockRejectedValue(new Error("network is down"));
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    // The error must NOT be masked as the 'no people' empty state.
    expect(screen.queryByText(/No people detected/)).toBeNull();
    expect(screen.getByText(/network is down/)).toBeTruthy();
  });

  it("falls back to a generic error message when the error has no message", async () => {
    mockGetFaceClusters.mockRejectedValue(new Error(""));
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.queryByText(/No people detected/)).toBeNull();
  });

  it("renders each cluster card as a button with an accessible label", async () => {
    mockGetFaceClusters.mockResolvedValue([
      {
        cluster_label: "c1",
        cluster_name: "Bride",
        face_count: 10,
        asset_count: 8,
        sample_asset_id: "a1",
      },
    ]);
    render(<FaceClusterBrowser token="test" />);

    const card = await screen.findByRole("button", {
      name: /View photos of Bride/i,
    });
    expect(card).toBeTruthy();
    // No raw unlabelled buttons on the surface.
    for (const button of screen.getAllByRole("button")) {
      const label =
        button.getAttribute("aria-label") || button.textContent?.trim();
      expect(label).toBeTruthy();
    }
  });

  it("renders cluster cards with names and counts", async () => {
    mockGetFaceClusters.mockResolvedValue([
      {
        cluster_label: "c1",
        cluster_name: "Bride",
        face_count: 45,
        asset_count: 30,
        sample_asset_id: "a1",
      },
      {
        cluster_label: "c2",
        cluster_name: "Groom",
        face_count: 32,
        asset_count: 25,
        sample_asset_id: "a2",
      },
    ]);
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByText("Bride")).toBeTruthy();
      expect(screen.getByText("Groom")).toBeTruthy();
      expect(screen.getByText("45 photos")).toBeTruthy();
      expect(screen.getByText("32 photos")).toBeTruthy();
    });
  });

  it("shows Unknown for unnamed clusters", async () => {
    mockGetFaceClusters.mockResolvedValue([
      {
        cluster_label: "c1",
        cluster_name: "",
        face_count: 10,
        asset_count: 8,
        sample_asset_id: "a1",
      },
    ]);
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByText("Unknown")).toBeTruthy();
    });
  });

  it("calls onSelectCluster when card clicked", async () => {
    const onSelect = vi.fn();
    mockGetFaceClusters.mockResolvedValue([
      {
        cluster_label: "c1",
        cluster_name: "Bride",
        face_count: 10,
        asset_count: 8,
        sample_asset_id: "a1",
      },
    ]);
    render(<FaceClusterBrowser token="test" onSelectCluster={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("Bride")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Bride"));
    expect(onSelect).toHaveBeenCalledWith("c1", "Bride");
  });

  it("passes galleryId to API call", async () => {
    mockGetFaceClusters.mockResolvedValue([]);
    render(<FaceClusterBrowser token="test" galleryId="gal-123" />);

    await waitFor(() => {
      expect(mockGetFaceClusters).toHaveBeenCalledWith("test", "gal-123");
    });
  });

  it("shows singular 'photo' for count of 1", async () => {
    mockGetFaceClusters.mockResolvedValue([
      {
        cluster_label: "c1",
        cluster_name: "Solo",
        face_count: 1,
        asset_count: 1,
        sample_asset_id: "a1",
      },
    ]);
    render(<FaceClusterBrowser token="test" />);

    await waitFor(() => {
      expect(screen.getByText("1 photo")).toBeTruthy();
    });
  });
});
