import { describe, it, expect } from "vitest";

describe("useDesignHistory", () => {
  it("module exports useDesignHistory hook", async () => {
    const mod = await import("../use-design-history");
    expect(mod.useDesignHistory).toBeDefined();
    expect(typeof mod.useDesignHistory).toBe("function");
  });

  it("module exports MAX_HISTORY_SIZE constant", async () => {
    const mod = await import("../use-design-history");
    expect(mod.MAX_HISTORY_SIZE).toBe(50);
  });
});
