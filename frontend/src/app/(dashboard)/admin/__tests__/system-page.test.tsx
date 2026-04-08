import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  getSystemMetrics: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import { getSystemMetrics } from "@/lib/api/admin";
import AdminSystemPage from "../system/page";

const mockMetrics = vi.mocked(getSystemMetrics);

const sampleMetrics = {
  api_latency_p50_ms: 12,
  api_latency_p95_ms: 45,
  api_latency_p99_ms: 120,
  error_rate_pct: 0.3,
  queue_depth: 15,
  storage_used_bytes: 5368709120,
  cpu_usage_pct: 42,
  memory_usage_pct: 67,
  disk_usage_pct: 55,
  uptime_seconds: 864000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMetrics.mockResolvedValue(sampleMetrics);
});

describe("AdminSystemPage", () => {
  it("renders API latency metrics", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/p50/i)).toBeTruthy();
      expect(screen.getByText(/12\s*ms/i)).toBeTruthy();
    });
  });

  it("shows p95 latency", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/p95/i)).toBeTruthy();
      expect(screen.getByText(/45\s*ms/i)).toBeTruthy();
    });
  });

  it("shows error rate", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/0\.3%/)).toBeTruthy();
    });
  });

  it("shows CPU usage", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/42%/)).toBeTruthy();
    });
  });

  it("shows memory usage", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/67%/)).toBeTruthy();
    });
  });

  it("shows disk usage", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/55%/)).toBeTruthy();
    });
  });

  it("shows queue depth", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText("15")).toBeTruthy();
    });
  });

  it("shows storage used in human-readable format", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      // 5368709120 bytes ~ 5.4 GB
      expect(screen.getByText(/5\.4\s*GB/i)).toBeTruthy();
    });
  });

  it("shows uptime", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      // 864000 seconds = 10 days
      expect(screen.getByText(/10\s*d/i)).toBeTruthy();
    });
  });

  it("shows loading state", () => {
    mockMetrics.mockReturnValue(new Promise(() => {}));
    render(<AdminSystemPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("handles API error", async () => {
    mockMetrics.mockRejectedValue(new Error("fail"));
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("calls getSystemMetrics on mount", async () => {
    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(mockMetrics).toHaveBeenCalledWith("test-token");
    });
  });
});
