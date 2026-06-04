import {
  createElement,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SettingsSectionTabs } from "../_components/settings-section-tabs";

const mockUsePathname = vi.fn(() => "/settings/storage");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

describe("SettingsSectionTabs", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/settings/storage");
  });

  it("renders profile, business, storage, and install app as settings tabs", () => {
    render(<SettingsSectionTabs />);

    expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.getByRole("tab", { name: "Business" })).toHaveAttribute(
      "href",
      "/settings/business",
    );
    expect(screen.getByRole("tab", { name: "Storage" })).toHaveAttribute(
      "href",
      "/settings/storage",
    );
    expect(screen.getByRole("tab", { name: "Install App" })).toHaveAttribute(
      "href",
      "/settings/pwa",
    );
  });

  it("marks the active settings route", () => {
    render(<SettingsSectionTabs />);

    expect(screen.getByRole("tab", { name: "Storage" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("uses fixed icon tabs with hover help instead of a mobile scrollbar", () => {
    render(<SettingsSectionTabs />);

    const tabNav = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    const tabList = screen.getByRole("tablist");
    const storageTab = screen.getByRole("tab", { name: "Storage" });

    expect(tabNav.className).not.toContain("overflow-x-auto");
    expect(tabList.className).toContain("settings-tabs-list");
    expect(storageTab.querySelector("svg")).not.toBeNull();
    expect(storageTab).not.toHaveAttribute("title");
    expect(storageTab).toHaveAttribute(
      "aria-describedby",
      "settings-tab-storage-hint",
    );
    expect(
      screen.getByText("Storage: Usage, quota, and plan storage"),
    ).toHaveAttribute("role", "tooltip");
    expect(
      screen.getByText("Personal Profile: display name, phone, avatar"),
    ).toHaveAttribute("role", "tooltip");
    expect(
      screen.getByText(
        "Business Profile: studio identity, GSTIN, and branding",
      ),
    ).toHaveAttribute("role", "tooltip");
    expect(screen.getAllByText("Personal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    expect(screen.getByText("App")).toBeInTheDocument();
  });
});
