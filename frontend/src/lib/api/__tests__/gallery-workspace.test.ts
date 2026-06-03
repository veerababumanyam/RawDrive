import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGallery,
  duplicateGallery,
  getGalleryWorkspaceSummary,
  linkGalleryRelationships,
} from "../galleries";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // These gallery workspace helpers route through authFetch, which reads
  // the in-memory access-token cache (getStoredAccessToken) rather than
  // its token arg. Seed the cache so the Authorization header is attached.
  persistAuthTokens("token");
});

afterEach(() => {
  clearAuthTokens();
});

describe("gallery workspace API", () => {
  it("creates galleries with CRM relationship fields", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "gallery-1",
        title: "Sharma Wedding",
        primary_contact_id: "contact-1",
      }),
    });

    await createGallery("token", {
      title: "Sharma Wedding",
      primary_contact_id: "contact-1",
      project_id: "project-1",
      event_id: "event-1",
      deal_id: "deal-1",
      invoice_id: "invoice-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"primary_contact_id":"contact-1"'),
      }),
    );
  });

  it("surfaces the backend create-gallery error body instead of only the status code", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      clone() {
        return this;
      },
      json: async () => ({ error: "create failed" }),
    });

    await expect(createGallery("token", { title: "Reception" })).rejects.toThrow(
      "Failed to create gallery: create failed (500)",
    );
  });

  it("links and unlinks gallery relationships through the workspace endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "gallery-1", primary_contact_id: "contact-1" }),
    });

    await linkGalleryRelationships("token", "gallery-1", {
      primary_contact_id: "contact-1",
      project_id: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/client-link"),
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"project_id":null'),
      }),
    );
  });

  it("loads a single workspace summary for the gallery shell", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        gallery: { id: "gallery-1", title: "Sharma Wedding" },
        primary_contact: { id: "contact-1", name: "Asha Sharma" },
        lifecycle_state: "draft",
        sections: [{ key: "proofing", href: "/galleries/gallery-1/proofing" }],
      }),
    });

    const summary = await getGalleryWorkspaceSummary("token", "gallery-1");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/galleries/gallery-1/workspace-summary");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(summary.primary_contact?.name).toBe("Asha Sharma");
  });

  it("duplicates galleries through the centralized gallery API client", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "copy-1", title: "Copy" }),
    });

    await duplicateGallery("token", "gallery-1", "Copy");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/duplicate"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
