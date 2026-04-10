import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FaceFilter } from "../face-filter";

// Mock the API client so the component's fetch calls are deterministic
// and we can assert on the dispatched filter events without spinning up
// a backend. Both functions the component uses live in lib/api/ai.
vi.mock("@/lib/api/ai", () => ({
  getFaceClusters: vi.fn(),
  getClusterAssets: vi.fn(),
}));

// eslint-disable-next-line import/first
import { getFaceClusters, getClusterAssets } from "@/lib/api/ai";

const mockGetClusters = vi.mocked(getFaceClusters);
const mockGetAssets = vi.mocked(getClusterAssets);

// Shared helper: build a minimal ClusterSummary. Every field present on
// the type must be set, even when the test doesn't care about the value,
// so a type-level change to ClusterSummary surfaces here instead of at
// runtime during the render.
function fakeCluster(overrides: Partial<{
  cluster_label: string;
  cluster_name: string;
  face_count: number;
  asset_count: number;
  sample_asset_id: string;
}> = {}) {
  return {
    cluster_label: "cluster-a",
    cluster_name: "Bride",
    face_count: 10,
    asset_count: 8,
    sample_asset_id: "asset-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up any event listeners installed by the component so tests
  // are hermetic.
  vi.restoreAllMocks();
});

describe("FaceFilter", () => {
  it("renders nothing when the API returns an empty cluster list", async () => {
    mockGetClusters.mockResolvedValue([]);
    const { container } = render(<FaceFilter token="t" galleryId="g1" />);

    // Wait for the loading spinner to disappear — the component unmounts
    // its own DOM once the promise resolves with zero clusters.
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/Loading faces/);
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders a chip for each cluster with name and count", async () => {
    mockGetClusters.mockResolvedValue([
      fakeCluster({ cluster_label: "c1", cluster_name: "Bride", asset_count: 12 }),
      fakeCluster({ cluster_label: "c2", cluster_name: "Groom", asset_count: 9 }),
    ]);

    render(<FaceFilter token="t" galleryId="g1" />);

    // Both chips should eventually render with their labels.
    expect(await screen.findByRole("button", { name: /Bride/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Groom/ })).toBeTruthy();

    // Counts show in the chip. Use RegExp since the label + count are
    // rendered as separate spans joined by whitespace.
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("dispatches rawdrive:face-filter with matched asset IDs on click", async () => {
    mockGetClusters.mockResolvedValue([
      fakeCluster({ cluster_label: "c1", cluster_name: "Bride" }),
    ]);
    mockGetAssets.mockResolvedValue({
      cluster_label: "c1",
      asset_ids: ["a1", "a2", "a3"],
      count: 3,
    });

    const eventSpy = vi.fn();
    window.addEventListener("rawdrive:face-filter", eventSpy as EventListener);

    render(<FaceFilter token="t" galleryId="g1" />);
    const chip = await screen.findByRole("button", { name: /Bride/ });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    const event = eventSpy.mock.calls[0][0] as CustomEvent<{ assetIds: string[] }>;
    expect(event.detail.assetIds).toEqual(["a1", "a2", "a3"]);

    window.removeEventListener("rawdrive:face-filter", eventSpy as EventListener);
  });

  it("clears the filter and dispatches face-filter-clear when the same chip is clicked twice", async () => {
    mockGetClusters.mockResolvedValue([
      fakeCluster({ cluster_label: "c1", cluster_name: "Bride" }),
    ]);
    mockGetAssets.mockResolvedValue({
      cluster_label: "c1",
      asset_ids: ["a1"],
      count: 1,
    });

    const clearSpy = vi.fn();
    window.addEventListener("rawdrive:face-filter-clear", clearSpy);

    render(<FaceFilter token="t" galleryId="g1" />);
    const chip = await screen.findByRole("button", { name: /Bride/ });

    // First click → activates the filter.
    fireEvent.click(chip);
    await waitFor(() => {
      expect(chip.getAttribute("aria-pressed")).toBe("true");
    });

    // Second click → clears it. The component toggles the active state
    // and dispatches the clear event so listeners reset.
    fireEvent.click(chip);
    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    window.removeEventListener("rawdrive:face-filter-clear", clearSpy);
  });

  it("shows an error banner when the cluster fetch fails but does not crash", async () => {
    mockGetClusters.mockRejectedValue(new Error("500 internal"));

    render(<FaceFilter token="t" galleryId="g1" />);

    expect(await screen.findByText(/500 internal/)).toBeTruthy();
  });
});
