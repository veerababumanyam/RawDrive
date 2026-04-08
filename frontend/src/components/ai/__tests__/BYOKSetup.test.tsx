import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
