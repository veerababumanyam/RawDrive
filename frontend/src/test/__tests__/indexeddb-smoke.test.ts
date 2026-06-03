import { describe, it, expect } from "vitest";
describe("indexeddb test env", () => {
  it("exposes indexedDB", () => {
    expect(typeof indexedDB).toBe("object");
    expect(indexedDB).toBeTruthy();
  });
});
