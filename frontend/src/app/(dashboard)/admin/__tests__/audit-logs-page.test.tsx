import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  listAuditLogs: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import { listAuditLogs } from "@/lib/api/admin";
import AdminAuditLogsPage from "../audit-logs/page";

const mockListLogs = vi.mocked(listAuditLogs);

const sampleLogs = {
  data: [
    {
      id: "log1", actor_id: "u1", actor_email: "admin@rawdrive.in",
      action: "user.suspended", resource_type: "user", resource_id: "u5",
      ip_address: "192.168.1.1", severity: "high", inserted_at: "2026-04-08T10:00:00Z",
    },
    {
      id: "log2", actor_id: "u1", actor_email: "admin@rawdrive.in",
      action: "moderation.approved", resource_type: "gallery", resource_id: "g3",
      ip_address: "192.168.1.1", severity: "medium", inserted_at: "2026-04-08T09:30:00Z",
    },
    {
      id: "log3", actor_id: "u2", actor_email: "support@rawdrive.in",
      action: "user.role_changed", resource_type: "user", resource_id: "u10",
      ip_address: "10.0.0.5", severity: "high", inserted_at: "2026-04-07T16:00:00Z",
    },
  ],
  total: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListLogs.mockResolvedValue(sampleLogs);
});

describe("AdminAuditLogsPage", () => {
  it("renders audit log entries", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText("user.suspended")).toBeTruthy();
      expect(screen.getByText("moderation.approved")).toBeTruthy();
    });
  });

  it("shows actor emails", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("admin@rawdrive.in").length).toBeGreaterThan(0);
    });
  });

  it("shows severity badges", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("high").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("medium")).toBeTruthy();
    });
  });

  it("shows resource type", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("user").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("gallery")).toBeTruthy();
    });
  });

  it("has filter by action input", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/filter|search/i)).toBeTruthy();
    });
  });

  it("shows total count", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 entries/i)).toBeTruthy();
    });
  });

  it("shows loading state", () => {
    mockListLogs.mockReturnValue(new Promise(() => {}));
    render(<AdminAuditLogsPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("shows empty state", async () => {
    mockListLogs.mockResolvedValue({ data: [], total: 0 });
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no.*logs/i)).toBeTruthy();
    });
  });

  it("handles API error", async () => {
    mockListLogs.mockRejectedValue(new Error("fail"));
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("calls listAuditLogs on mount", async () => {
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(mockListLogs).toHaveBeenCalledWith("test-token", expect.any(Object));
    });
  });
});
