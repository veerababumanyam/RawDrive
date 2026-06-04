import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  emptyPhotographerProfile,
  type PhotographerProfile,
} from "@/lib/api/photographer-profile";
import { AvatarCrop } from "../avatar-crop";

function renderAvatarCrop(profile: PhotographerProfile) {
  return render(
    <AvatarCrop
      profile={profile}
      onProfileChange={vi.fn()}
      onError={vi.fn()}
    />,
  );
}

describe("AvatarCrop", () => {
  it("keeps crop controls out of the default profile view", () => {
    const profile = {
      ...emptyPhotographerProfile(),
      avatar_url: "/storage/avatar-original.jpg",
      avatar_cropped_url: "/storage/avatar-cropped.webp",
    };

    renderAvatarCrop(profile);

    expect(screen.getByRole("button", { name: "Change avatar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit crop" })).toBeVisible();
    expect(screen.queryByLabelText("Horizontal")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Vertical")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply crop" }),
    ).not.toBeInTheDocument();
  });

  it("shows crop controls only while editing the avatar", () => {
    const profile = {
      ...emptyPhotographerProfile(),
      avatar_url: "/storage/avatar-original.jpg",
      avatar_cropped_url: "/storage/avatar-cropped.webp",
    };

    renderAvatarCrop(profile);

    fireEvent.click(screen.getByRole("button", { name: "Edit crop" }));

    expect(screen.getByLabelText("Horizontal")).toBeVisible();
    expect(screen.getByLabelText("Vertical")).toBeVisible();
    expect(screen.getByLabelText("Zoom")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply crop" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});
