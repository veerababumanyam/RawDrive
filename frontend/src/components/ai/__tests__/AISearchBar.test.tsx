import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AISearchBar } from "../AISearchBar";

vi.mock("@/lib/api/ai", () => ({
  searchAssets: vi.fn(),
}));

import { searchAssets } from "@/lib/api/ai";

const mockSearchAssets = vi.mocked(searchAssets);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AISearchBar", () => {
  it("renders search input with placeholder", () => {
    mockSearchAssets.mockResolvedValue({ results: [], total: 0 });
    render(<AISearchBar token="test" />);
    expect(screen.getByPlaceholderText(/Search photos/)).toBeTruthy();
  });

  it("shows search icon", () => {
    render(<AISearchBar token="test" />);
    // SVG search icon should be present
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("debounces search calls", async () => {
    mockSearchAssets.mockResolvedValue({ results: [], total: 0 });
    render(<AISearchBar token="test" />);

    const input = screen.getByPlaceholderText(/Search photos/);
    fireEvent.change(input, { target: { value: "sunset" } });

    // Shouldn't have called yet (debounce)
    expect(mockSearchAssets).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(mockSearchAssets).toHaveBeenCalledWith("test", "sunset", undefined);
    });
  });

  it("shows empty results message after search", async () => {
    mockSearchAssets.mockResolvedValue({ results: [], total: 0 });
    render(<AISearchBar token="test" />);

    const input = screen.getByPlaceholderText(/Search photos/);
    fireEvent.change(input, { target: { value: "nonexistent" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByText(/No results found/)).toBeTruthy();
    });
  });

  it("renders results with similarity scores", async () => {
    mockSearchAssets.mockResolvedValue({
      results: [
        {
          asset_id: "a1",
          filename: "sunset.jpg",
          content_type: "image/jpeg",
          thumbnail_urls: { md: "/thumb/a1.jpg" },
          similarity: 0.92,
          ai_caption: "Golden sunset",
        },
      ],
      total: 1,
    });
    render(<AISearchBar token="test" />);

    const input = screen.getByPlaceholderText(/Search photos/);
    fireEvent.change(input, { target: { value: "sunset" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByText("92% match")).toBeTruthy();
    });
  });

  it("calls onResults callback", async () => {
    const onResults = vi.fn();
    mockSearchAssets.mockResolvedValue({
      results: [
        {
          asset_id: "a1",
          filename: "test.jpg",
          content_type: "image/jpeg",
          thumbnail_urls: { md: "/thumb/a1.jpg" },
          similarity: 0.91,
        },
      ],
      total: 1,
    });
    render(<AISearchBar token="test" onResults={onResults} />);

    const input = screen.getByPlaceholderText(/Search photos/);
    fireEvent.change(input, { target: { value: "test" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(onResults).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ asset_id: "a1" })]));
    });
  });
});
