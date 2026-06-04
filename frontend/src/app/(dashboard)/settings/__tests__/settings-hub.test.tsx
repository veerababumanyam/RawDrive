import { describe, expect, it, vi } from "vitest";

import SettingsPage from "../page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Settings default route", () => {
  it("opens the Personal settings tab", () => {
    SettingsPage();

    expect(redirect).toHaveBeenCalledWith("/settings/profile");
  });
});
