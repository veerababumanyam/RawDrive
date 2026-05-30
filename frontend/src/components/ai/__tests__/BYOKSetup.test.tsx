import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BYOKSetup } from "../BYOKSetup";

// Mock the API module
vi.mock("@/lib/api/ai", () => ({
  getAIConfig: vi.fn(),
  saveAIConfig: vi.fn(),
  validateAIKey: vi.fn(),
}));

import { getAIConfig, saveAIConfig, validateAIKey } from "@/lib/api/ai";

const mockGetAIConfig = vi.mocked(getAIConfig);
const mockSaveAIConfig = vi.mocked(saveAIConfig);
const mockValidateAIKey = vi.mocked(validateAIKey);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BYOKSetup", () => {
  it("shows loading state initially", () => {
    mockGetAIConfig.mockReturnValue(new Promise(() => {})); // never resolves
    render(<BYOKSetup token="test" />);
    // Should show a spinner (loading state)
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows unconfigured state when no key", async () => {
    mockGetAIConfig.mockResolvedValue({ configured: false });
    render(<BYOKSetup token="test" />);

    await waitFor(() => {
      expect(screen.getByText("Gemini API Key")).toBeTruthy();
    });

    // Should show the API key input
    expect(screen.getByPlaceholderText("AIza...")).toBeTruthy();
  });

  it("shows configured state with masked key", async () => {
    mockGetAIConfig.mockResolvedValue({
      configured: true,
      provider: "gemini",
      model_preference: "gemini-2.0-flash",
      key_masked: "AIza...xxxx",
      enabled: true,
    });
    render(<BYOKSetup token="test" />);

    await waitFor(() => {
      expect(screen.getByText(/Key configured:/)).toBeTruthy();
      expect(screen.getByText(/AIza...xxxx/)).toBeTruthy();
    });
  });

  it("saves key on submit", async () => {
    mockGetAIConfig
      .mockResolvedValueOnce({ configured: false })
      .mockResolvedValueOnce({ configured: true, key_masked: "AIza...1234" });
    mockSaveAIConfig.mockResolvedValue(undefined);

    render(<BYOKSetup token="test" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("AIza...")).toBeTruthy();
    });

    const input = screen.getByPlaceholderText("AIza...");
    fireEvent.change(input, { target: { value: "AIzaSyTestKey12345" } });

    const saveBtn = screen.getByText("Save Key");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockSaveAIConfig).toHaveBeenCalledWith("test", "AIzaSyTestKey12345", "gemini-2.0-flash");
    });
  });

  it("validates key when test button clicked", async () => {
    mockGetAIConfig.mockResolvedValue({
      configured: true,
      provider: "gemini",
      key_masked: "AIza...xxxx",
    });
    mockValidateAIKey.mockResolvedValue({ valid: true });

    render(<BYOKSetup token="test" />);

    await waitFor(() => {
      expect(screen.getByText("Test Key")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Test Key"));

    await waitFor(() => {
      expect(screen.getByText("Key is valid and working.")).toBeTruthy();
    });
  });

  it("shows validation failure", async () => {
    mockGetAIConfig.mockResolvedValue({
      configured: true,
      provider: "gemini",
      key_masked: "AIza...xxxx",
    });
    mockValidateAIKey.mockResolvedValue({ valid: false, error: "API key expired" });

    render(<BYOKSetup token="test" />);

    await waitFor(() => {
      expect(screen.getByText("Test Key")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Test Key"));

    await waitFor(() => {
      expect(screen.getByText(/API key expired/)).toBeTruthy();
    });
  });

  // F-095: prop-change data race. When the `token` prop changes while the
  // first getAIConfig(token-A) request is still in flight, the effect's
  // cleanup must set an `ignore` flag so the stale token-A response cannot
  // overwrite the state produced by the current token-B request.
  //
  // Both requests are kept as deferred promises so resolution order is
  // fully controlled: token-B resolves first and commits its state, then
  // the stale token-A response is resolved LAST. With the cleanup guard in
  // place, token-A's late resolve is a no-op. Without it, token-A's
  // setConfig/setModel overwrite the fresh token-B state — which is exactly
  // the data race this regression test pins down.
  it("ignores a stale token response that resolves after the token prop changes", async () => {
    let resolveA!: (cfg: unknown) => void;
    let resolveB!: (cfg: unknown) => void;
    const aPromise = new Promise((res) => {
      resolveA = res as (cfg: unknown) => void;
    });
    const bPromise = new Promise((res) => {
      resolveB = res as (cfg: unknown) => void;
    });

    mockGetAIConfig.mockImplementation((tok: string) =>
      (tok === "token-A" ? aPromise : bPromise) as Promise<never>,
    );

    const { rerender } = render(<BYOKSetup token="token-A" />);

    // Switch to token-B before token-A resolves. The token-A effect's
    // cleanup runs here, setting its ignore flag.
    rerender(<BYOKSetup token="token-B" />);

    // Resolve the CURRENT (token-B) request first and let it commit.
    resolveB({
      configured: true,
      key_masked: "AIza...BBBB",
      model_preference: "gemini-1.5-pro",
    });

    // The <select> value (set from cfg.model_preference inside the effect's
    // .then) is the race-sensitive signal, so assertions key off it rather
    // than the masked key, which renders as a split text node.
    await waitFor(() => {
      const select = document.querySelector("select") as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe("gemini-1.5-pro");
    });

    // Now let the STALE token-A response land last. The resolve + its .then
    // chain are flushed inside act() so that an UNGUARDED effect's setModel
    // actually commits to the DOM before we assert — otherwise the test
    // would pass regardless of the fix. With the cleanup guard in place this
    // is a no-op; without it, the model preference is overwritten to
    // gemini-2.0-flash, regressing the fresh token-B state.
    await act(async () => {
      resolveA({
        configured: true,
        key_masked: "AIza...AAAA",
        model_preference: "gemini-2.0-flash",
      });
      await aPromise;
      // Drain the .then/.catch/.finally microtask chain.
      await Promise.resolve();
      await Promise.resolve();
    });

    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("gemini-1.5-pro");
  });
});
