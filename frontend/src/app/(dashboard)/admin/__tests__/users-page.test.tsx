import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  listUsers: vi.fn(),
  listAdminPlans: vi.fn(),
  suspendUser: vi.fn(),
  reactivateUser: vi.fn(),
  deleteUser: vi.fn(),
  changeUserRole: vi.fn(),
  changeUserTier: vi.fn(),
  exportUsers: vi.fn(),
  createUser: vi.fn(),
  impersonateUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import {
  listAdminPlans,
  listUsers,
  suspendUser,
  reactivateUser,
} from "@/lib/api/admin";
import AdminUsersPage from "../users/page";

const mockListUsers = vi.mocked(listUsers);
const mockListAdminPlans = vi.mocked(listAdminPlans);
const mockSuspendUser = vi.mocked(suspendUser);
const mockReactivateUser = vi.mocked(reactivateUser);

const sampleUsers = {
  items: [
    {
      id: "u1",
      email: "alice@example.com",
      full_name: "Alice Sharma",
      platform_role: "photographer",
      status: "active" as const,
      workspace_count: 2,
      state_name: "Karnataka",
      tier_name: "Pro",
      created_at: "2026-01-15T00:00:00Z",
    },
    {
      id: "u2",
      email: "bob@example.com",
      full_name: "Bob Verma",
      platform_role: "photographer",
      status: "suspended" as const,
      workspace_count: 1,
      state_name: "Maharashtra",
      tier_name: "Free",
      created_at: "2026-02-20T00:00:00Z",
    },
  ],
  total_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListUsers.mockResolvedValue(sampleUsers);
  mockListAdminPlans.mockResolvedValue([
    {
      tier: "free",
      name: "Free",
      description: "",
      currency: "INR",
      monthly_price_paise: 0,
      annual_price_paise: 0,
      quota_bytes: 1073741824,
      gallery_limit: 3,
      client_limit: 5,
      features: [],
      popular: false,
      rank: 0,
      paid: false,
      active: true,
      self_serve: true,
      trial_days: 30,
    },
  ]);
});

describe("AdminUsersPage", () => {
  it("renders user list with names and emails", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText("Alice Sharma")).toBeTruthy();
      expect(screen.getByText("alice@example.com")).toBeTruthy();
      expect(screen.getByText("Bob Verma")).toBeTruthy();
    });
  });

  it("shows user status badges", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText("active")).toBeTruthy();
      expect(screen.getByText("suspended")).toBeTruthy();
    });
  });

  it("shows state and tier info", async () => {
    render(<AdminUsersPage />);
    // "Karnataka" now appears twice: once as Alice's row cell (<span>) and once
    // as an <option> in the State filter dropdown (filterOptions are derived
    // from the user rows' state_name values). Scope the assertion to Alice's
    // table row so we assert the USER'S state, not the filter option. "Pro"
    // (tier) is not a filter option ("Free"/"Starter"/… are), so it stays an
    // unambiguous lookup that confirms the tier renders.
    await waitFor(() => screen.getByText("Alice Sharma"));
    const aliceRow = screen
      .getByText("Alice Sharma")
      .closest("tr") as HTMLTableRowElement;
    expect(aliceRow).not.toBeNull();
    expect(within(aliceRow).getByText("Karnataka")).toBeTruthy();
    expect(within(aliceRow).getByText("Pro")).toBeTruthy();
  });

  it("renders search input", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    });
  });

  it("displays total user count", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 users/i)).toBeTruthy();
    });
  });

  it("shows loading state initially", () => {
    mockListUsers.mockReturnValue(new Promise(() => {}));
    render(<AdminUsersPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("handles empty user list", async () => {
    mockListUsers.mockResolvedValue({ items: [], total_count: 0 });
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText(/no users/i)).toBeTruthy();
    });
  });

  it("calls suspendUser on suspend action", async () => {
    mockSuspendUser.mockResolvedValue(undefined);
    render(<AdminUsersPage />);
    await waitFor(() => screen.getByText("Alice Sharma"));
    const suspendBtns = screen.getAllByRole("button", { name: /suspend/i });
    fireEvent.click(suspendBtns[0]);
    await waitFor(() => {
      expect(mockSuspendUser).toHaveBeenCalledWith(
        "test-token",
        "u1",
        expect.any(String),
      );
    });
  });

  it("calls reactivateUser on reactivate action", async () => {
    mockReactivateUser.mockResolvedValue(undefined);
    render(<AdminUsersPage />);
    await waitFor(() => screen.getByText("Bob Verma"));
    const reactivateBtns = screen.getAllByRole("button", {
      name: /reactivate/i,
    });
    fireEvent.click(reactivateBtns[0]);
    await waitFor(() => {
      expect(mockReactivateUser).toHaveBeenCalledWith("test-token", "u2");
    });
  });

  it("shows role column", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("photographer").length).toBeGreaterThan(0);
    });
  });

  it("has export CSV button", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export/i })).toBeTruthy();
    });
  });

  it("calls listUsers on mount", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledWith(
        "test-token",
        expect.any(Object),
      );
    });
  });

  it("handles API error gracefully", async () => {
    mockListUsers.mockRejectedValue(new Error("Network error"));
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("shows workspace count per user", async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy();
    });
  });
});
