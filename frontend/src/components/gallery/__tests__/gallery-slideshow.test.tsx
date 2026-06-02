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

function setup(props: Partial<React.ComponentProps<typeof GallerySlideshow>> = {}) {
  const onClose = vi.fn();
  render(<GallerySlideshow images={IMAGES} intervalMs={1000} onClose={onClose} {...props} />);
  return { onClose };
}

describe("GallerySlideshow", () => {
  it("renders the first slide and a slide counter", () => {
    setup();
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Play slideshow" })).toBeInTheDocument();
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
    expect(screen.getByTestId("slideshow-audio")).toHaveAttribute("src", "/api/v1/public/galleries/x/music");
    // starts muted (autoplay policy) → control offers to unmute
    const muteBtn = screen.getByRole("button", { name: "Unmute music" });
    fireEvent.click(muteBtn);
    expect(screen.getByRole("button", { name: "Mute music" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("omits audio + mute control when there is no music", () => {
    setup();
    expect(screen.queryByTestId("slideshow-audio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mute music/i })).not.toBeInTheDocument();
  });
});
