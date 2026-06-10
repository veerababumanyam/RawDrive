import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/base-url", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

import { getMyListing } from "../marketplace";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("marketplace API", () => {
  it("treats a missing own freelancer profile as a quiet null payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: null }),
    });

    await expect(getMyListing("token")).resolves.toBeNull();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/freelancer-profile/mine");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer token",
    );
  });

  it("keeps backward compatibility with older 404 no-profile responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "no listing found", data: null }),
    });

    await expect(getMyListing("token")).resolves.toBeNull();
  });
});
