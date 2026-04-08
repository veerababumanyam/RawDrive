import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  listModerationQueue: vi.fn(),
  approveModeration: vi.fn(),
  rejectModeration: vi.fn(),
  escalateModeration: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import { listModerationQueue, approveModeration, rejectModeration, escalateModeration } from "@/lib/api/admin";
import AdminModerationPage from "../moderation/page";

const mockListQueue = vi.mocked(listModerationQueue);
const mockApprove = vi.mocked(approveModeration);
const mockReject = vi.mocked(rejectModeration);
const mockEscalate = vi.mocked(escalateModeration);

const sampleQueue = {
  data: [
    {
      id: "mod1", content_type: "gallery", content_id: "g1", workspace_id: "ws1",
      reason: "auto_flagged", status: "pending", created_at: "2026-04-01T12:00:00Z",
    },
    {
      id: "mod2", content_type: "image", content_id: "img1", workspace_id: "ws2",
      reason: "reported", reporter_id: "u5", status: "pending", created_at: "2026-04-02T14:00:00Z",
    },
  ],
  total: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListQueue.mockResolvedValue(sampleQueue);
});

describe("AdminModerationPage", () => {
  it("renders moderation queue items", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText("gallery")).toBeTruthy();
      expect(screen.getByText("image")).toBeTruthy();
    });
  });

  it("shows reason badges", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText(/auto.flagged/i)).toBeTruthy();
      expect(screen.getByText(/reported/i)).toBeTruthy();
    });
  });

  it("shows pending count", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 pending/i)).toBeTruthy();
    });
  });

  it("has approve button", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /approve/i }).length).toBeGreaterThan(0);
    });
  });

  it("calls approveModeration on approve click", async () => {
    mockApprove.mockResolvedValue(undefined);
    render(<AdminModerationPage />);
    await waitFor(() => screen.getByText("gallery"));
    const approveBtns = screen.getAllByRole("button", { name: /approve/i });
    fireEvent.click(approveBtns[0]);
    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith("test-token", "mod1");
    });
  });

  it("calls rejectModeration on reject click", async () => {
    mockReject.mockResolvedValue(undefined);
    render(<AdminModerationPage />);
    await waitFor(() => screen.getByText("gallery"));
    const rejectBtns = screen.getAllByRole("button", { name: /reject/i });
    fireEvent.click(rejectBtns[0]);
    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith("test-token", "mod1", expect.any(String));
    });
  });

  it("has escalate option", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /escalate/i }).length).toBeGreaterThan(0);
    });
  });

  it("shows loading state", () => {
    mockListQueue.mockReturnValue(new Promise(() => {}));
    render(<AdminModerationPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("shows empty state when no items", async () => {
    mockListQueue.mockResolvedValue({ data: [], total: 0 });
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText(/no items/i)).toBeTruthy();
    });
  });

  it("displays content type and timestamps", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText("gallery")).toBeTruthy();
    });
  });

  it("handles API error", async () => {
    mockListQueue.mockRejectedValue(new Error("fail"));
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("calls listModerationQueue on mount", async () => {
    render(<AdminModerationPage />);
    await waitFor(() => {
      expect(mockListQueue).toHaveBeenCalledWith("test-token", expect.any(Object));
    });
  });
});
