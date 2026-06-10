import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import InstallPage from "@/app/install/page";
import manifest from "../../../public/manifest.json";

describe("Install page", () => {
  it("links directly to the RawDrive app dashboard", () => {
    render(<InstallPage />);

    expect(
      screen.getByRole("link", { name: /open rawdrive app/i }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("offers a download app action in the direct app link card", () => {
    render(<InstallPage />);

    expect(
      screen.getByRole("button", { name: /download app/i }),
    ).toBeInTheDocument();
  });

  it("starts installed PWA sessions in the app shell", () => {
    expect(manifest.start_url).toBe("/dashboard");
  });
});
