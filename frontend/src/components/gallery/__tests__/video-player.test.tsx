import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../video-player";

describe("VideoPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a retry and original-file fallback when native playback errors", () => {
    render(
      <VideoPlayer
        src="https://api.rawdrive.in/storage/videos/event.mov"
        poster="https://api.rawdrive.in/storage/videos/event-poster.webp"
      />,
    );

    const video = document.querySelector("video");
    expect(video).toBeInstanceOf(HTMLVideoElement);
    fireEvent.error(video as HTMLVideoElement);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Video player error");
    expect(
      within(alert).getByRole("button", { name: "Retry playback" }),
    ).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Open original" })).toHaveAttribute(
      "href",
      "https://api.rawdrive.in/storage/videos/event.mov",
    );
  });

  it("surfaces browser play rejections instead of leaving the player silent", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("blocked"),
    );

    render(<VideoPlayer src="https://api.rawdrive.in/storage/videos/event.mp4" />);

    fireEvent.click(screen.getByRole("button", { name: "Play (Space)" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Browser blocked playback",
      );
    });
  });

  it("reloads the media element when retrying after an error", async () => {
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    render(<VideoPlayer src="https://api.rawdrive.in/storage/videos/event.mp4" />);

    const video = document.querySelector("video");
    expect(video).toBeInstanceOf(HTMLVideoElement);
    fireEvent.error(video as HTMLVideoElement);
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Retry playback",
      }),
    );

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
    });
  });
});
