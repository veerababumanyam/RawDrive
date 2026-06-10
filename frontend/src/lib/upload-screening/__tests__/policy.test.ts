import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetPolicyCache,
  activePolicyVersion,
} from "../policy";

describe("upload screening policy cache", () => {
  afterEach(() => {
    _resetPolicyCache();
    vi.restoreAllMocks();
  });

  it("shares one in-flight policy fetch across concurrent uploads", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            versions: [
              {
                policy_version: "upload-screening/current",
                published_at: "2026-06-01T00:00:00Z",
                max_age_days: 30,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const versions = await Promise.all([
      activePolicyVersion("http://localhost:8080"),
      activePolicyVersion("http://localhost:8080"),
      activePolicyVersion("http://localhost:8080"),
    ]);

    expect(versions).toEqual([
      "upload-screening/current",
      "upload-screening/current",
      "upload-screening/current",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
