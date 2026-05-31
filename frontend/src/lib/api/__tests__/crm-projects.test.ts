import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createProject, getProject, listProjects } from "../crm";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // listProjects routes through authFetch, which reads the in-memory
  // access-token cache (getStoredAccessToken) rather than its token arg.
  // Seed the cache so the Authorization header is attached.
  persistAuthTokens("token");
});

afterEach(() => {
  clearAuthTokens();
});

describe("CRM project API", () => {
  it("lists Studio Projects from the canonical project endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ projects: [{ id: "project-1", name: "Sharma Wedding", status: "booked" }] }),
    });

    const projects = await listProjects("token");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/crm/projects?");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Sharma Wedding");
  });

  it("creates and loads project aggregates through /crm/projects", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "project-1", name: "Sharma Wedding", status: "quoted" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: { id: "project-1", name: "Sharma Wedding", status: "quoted" },
          bookings: [],
          contracts: [],
          invoices: [],
          galleries: [],
          follow_ups: [],
          timeline: [],
        }),
      });

    await createProject("token", { contact_id: "contact-1", name: "Sharma Wedding", status: "quoted" });
    await getProject("token", "project-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v1/crm/projects"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/v1/crm/projects/project-1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }),
    );
  });
});
