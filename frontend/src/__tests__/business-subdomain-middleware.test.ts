import { describe, expect, it } from "vitest";
import { resolveBusinessSubdomainRewrite } from "@/middleware";

describe("business subdomain middleware routing", () => {
  it("rewrites the root business subdomain to the public studio landing page", () => {
    const rewrite = resolveBusinessSubdomainRewrite("/", "", "kaveri-stories-a1b2c3d4");

    expect(rewrite).toEqual({
      pathname: "/studio",
      search: "?ws=kaveri-stories-a1b2c3d4",
    });
  });

  it("continues routing gallery slugs under the same business subdomain", () => {
    const rewrite = resolveBusinessSubdomainRewrite(
      "/wedding-veera",
      "?album=family",
      "kaveri-stories-a1b2c3d4",
    );

    expect(rewrite).toEqual({
      pathname: "/g/wedding-veera",
      search: "?album=family&ws=kaveri-stories-a1b2c3d4",
    });
  });
});
