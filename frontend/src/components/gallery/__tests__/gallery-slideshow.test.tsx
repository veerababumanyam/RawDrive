import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GallerySlideshow } from "../gallery-slideshow";

// jsdom doesn't implement media playback — stub so the audio-sync effect is inert.
beforeEach(() => {
  vi.useFakeTimers();
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const IMAGES = ["/img/a.webp", "/img/b.webp", "/img/c.webp"];

function setup(
  props: Partial<React.ComponentProps<typeof GallerySlideshow>> = {},
) {
  const onClose = vi.fn();
  render(
    <GallerySlideshow
      images={IMAGES}
      intervalMs={1000}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
}

describe("GallerySlideshow", () => {
  it("renders the first slide and a slide counter", () => {
    setup();
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("uses the media glass surface and stable slideshow control shells", () => {
    setup({ musicUrl: "/api/v1/public/galleries/x/music" });

    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });
    expect(dialog).toHaveAttribute("data-glass-surface", "media");
    expect(dialog).toHaveClass("gallery-slideshow");
    expect(screen.getByAltText("Slide 1 of 3")).toHaveClass(
      "gallery-slideshow__image",
    );
    expect(screen.getByText("1 / 3")).toHaveClass(
      "gallery-slideshow__counter",
    );
    expect(
      screen
        .getByRole("button", { name: "Close slideshow" })
        .closest(".gallery-slideshow__close"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Previous slide" })
        .closest(".gallery-slideshow__controls"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause slideshow" })).toHaveClass(
      "gallery-slideshow__primary-control",
    );
  });

  it("auto-advances to the next slide after the interval", () => {
    setup({ intervalMs: 1000 });
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByAltText("Slide 2 of 3")).toBeInTheDocument();
  });

  it("pauses auto-advance when paused", () => {
    setup({ intervalMs: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
    // The control now offers Play (resume).
    expect(
      screen.getByRole("button", { name: "Play slideshow" }),
    ).toBeInTheDocument();
  });

  it("advances and goes back with the next/prev controls", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByAltText("Slide 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
  });

  it("closes on the close control and Escape", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close slideshow" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders the audio element and a mute toggle only when music is provided", () => {
    const { onClose } = setup({ musicUrl: "/api/v1/public/galleries/x/music" });
    const audio = screen.getByTestId("slideshow-audio");
    expect(audio).toHaveAttribute("src", "/api/v1/public/galleries/x/music");
    // starts UNMUTED and attempts autoplay → control offers to mute, and
    // the <audio> element is not muted.
    expect((audio as HTMLAudioElement).muted).toBe(false);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    const muteBtn = screen.getByRole("button", { name: "Mute music" });
    fireEvent.click(muteBtn);
    expect(
      screen.getByRole("button", { name: "Unmute music" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("plays muted then auto-unmutes on the first user gesture when unmuted autoplay is blocked", async () => {
    // Unmuted play() is rejected by the browser autoplay policy. The effect
    // then plays MUTED (so the track is already running) and auto-unmutes on
    // the first interaction anywhere — the visitor never touches the control.
    const play = vi
      .fn()
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.play = play;

    setup({ musicUrl: "/api/v1/public/galleries/x/music" });
    const audio = screen.getByTestId("slideshow-audio") as HTMLAudioElement;

    // Settle the rejected unmuted attempt: call #1 unmuted (rejected), call #2
    // the muted retry that keeps the track running and in sync.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(audio.muted).toBe(true);

    // First interaction anywhere → unmute + play (call #3).
    act(() => {
      fireEvent.pointerDown(document);
    });
    expect(play).toHaveBeenCalledTimes(3);
    expect(audio.muted).toBe(false);

    // The one-time listener removed itself — a second gesture does not replay.
    act(() => {
      fireEvent.pointerDown(document);
    });
    expect(play).toHaveBeenCalledTimes(3);
  });

  it("omits audio + mute control when there is no music", () => {
    setup();
    expect(screen.queryByTestId("slideshow-audio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mute music/i }),
    ).not.toBeInTheDocument();
  });

  it("moves focus into the modal dialog on open so aria-modal isn't lying", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Without the focus trap, keyboard focus would stay on the launch button
    // behind this fullscreen overlay.
    expect(document.activeElement).toBe(dialog);
  });
});
