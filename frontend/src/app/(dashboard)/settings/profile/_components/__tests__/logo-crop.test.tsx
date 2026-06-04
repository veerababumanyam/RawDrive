import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  emptyPhotographerProfile,
  type PhotographerProfile,
} from "@/lib/api/photographer-profile";
import { LogoCrop } from "../logo-crop";

function renderLogoCrop(profile: PhotographerProfile) {
  return render(
    <LogoCrop profile={profile} onProfileChange={vi.fn()} onError={vi.fn()} />,
  );
}

describe("LogoCrop", () => {
  it("invites a logo upload when none is set", () => {
    renderLogoCrop(emptyPhotographerProfile());

    expect(screen.getByRole("button", { name: "Upload logo" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit crop" }),
    ).not.toBeInTheDocument();
  });

  it("reveals free-aspect crop sliders only while editing", () => {
    const profile = {
      ...emptyPhotographerProfile(),
      business_logo_url: "/storage/logo-original.png",
      business_logo_rendered_url: "/storage/logo-render.webp",
    };

    renderLogoCrop(profile);

    expect(screen.getByRole("button", { name: "Change logo" })).toBeVisible();
    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit crop" }));

    expect(screen.getByLabelText("Horizontal")).toBeVisible();
    expect(screen.getByLabelText("Vertical")).toBeVisible();
    expect(screen.getByLabelText("Zoom")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply crop" })).toBeVisible();
  });

  it("previews the logo with object-contain (free aspect, never squared)", () => {
    const profile = {
      ...emptyPhotographerProfile(),
      business_logo_rendered_url: "/storage/logo-render.webp",
    };

    renderLogoCrop(profile);

    const frame = screen.getByRole("img", { name: "Business logo" });
    const img = frame.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.className).toContain("object-contain");
  });
});
