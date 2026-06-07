import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GallerySlideshow } from "../gallery-slideshow";

let fullscreenElement: Element | null = null;
let webkitFullscreenElement: Element | null = null;
let requestFullscreenMock: ReturnType<typeof vi.fn>;
let exitFullscreenMock: ReturnType<typeof vi.fn>;
let visualViewportState: {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
};
let visualViewportTarget: EventTarget;

// jsdom doesn't implement media playback — stub so the audio-sync effect is inert.
beforeEach(() => {
  vi.useFakeTimers();
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 144,
  });
  visualViewportState = {
    height: 701,
    width: 393,
    offsetTop: 17,
    offsetLeft: 0,
  };
  visualViewportTarget = new EventTarget();
  Object.defineProperties(visualViewportTarget, {
    height: { configurable: true, get: () => visualViewportState.height },
    width: { configurable: true, get: () => visualViewportState.width },
    offsetTop: { configurable: true, get: () => visualViewportState.offsetTop },
    offsetLeft: {
      configurable: true,
      get: () => visualViewportState.offsetLeft,
    },
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: visualViewportTarget,
  });
  fullscreenElement = null;
  webkitFullscreenElement = null;
  requestFullscreenMock = vi.fn(() => {
    fullscreenElement = document.querySelector(".gallery-slideshow");
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  exitFullscreenMock = vi.fn(() => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreenMock,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreenMock,
  });
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  document.body.style.overscrollBehavior = "";
  document.documentElement.style.overscrollBehavior = "";
});

const IMAGES = ["/img/a.webp", "/img/b.webp", "/img/c.webp"];

function setup(
  props: Partial<React.ComponentProps<typeof GallerySlideshow>> = {},
) {
  const onClose = vi.fn();
  const result = render(
    <GallerySlideshow
      images={IMAGES}
      intervalMs={1000}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose, ...result };
}

describe("GallerySlideshow", () => {
  it("renders the first slide and a slide counter", () => {
    setup();
    expect(screen.getByAltText("Slide 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("renders each photo in a same-source ambient media frame", () => {
    setup();

    const image = screen.getByAltText("Slide 1 of 3");
    const frame = image.closest(".gallery-slideshow__media-frame");
    expect(frame).toBeTruthy();
    expect(image).toHaveClass("gallery-slideshow__image");
    const ambient = frame?.querySelector(".gallery-slideshow__ambient-image");
    expect(ambient).toHaveAttribute("src", "/img/a.webp");
    expect(ambient).toHaveAttribute("aria-hidden", "true");
    expect(
      frame?.querySelector(".gallery-slideshow__ambient-scrim"),
    ).toBeTruthy();
  });

  it("uses the media glass surface and stable slideshow control shells", () => {
    setup({ musicUrl: "/api/v1/public/galleries/x/music" });

    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });
    expect(dialog).toHaveAttribute("data-glass-surface", "media");
    expect(dialog).toHaveClass("gallery-slideshow");
    expect(screen.getByAltText("Slide 1 of 3")).toHaveClass(
      "gallery-slideshow__image",
    );
    expect(screen.getByText("1 / 3")).toHaveClass("gallery-slideshow__counter");
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
    expect(
      screen.getByRole("button", { name: "Fullscreen" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause slideshow" })).toHaveClass(
      "gallery-slideshow__primary-control",
    );
  });

  it("locks scroll and sizes the shell to the visual viewport", () => {
    const { unmount } = setup();
    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });

    expect(dialog).toHaveClass("immersive-viewer-shell");
    expect(dialog.style.getPropertyValue("--immersive-viewer-height")).toBe(
      "701px",
    );
    expect(dialog.style.getPropertyValue("--immersive-viewer-width")).toBe(
      "393px",
    );
    expect(dialog.style.getPropertyValue("--immersive-viewer-top")).toBe(
      "17px",
    );
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    visualViewportState.height = 640;
    visualViewportTarget.dispatchEvent(new Event("resize"));
    expect(dialog.style.getPropertyValue("--immersive-viewer-height")).toBe(
      "640px",
    );

    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 144,
      behavior: "instant",
    });
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

  it("toggles browser fullscreen from the slideshow control", async () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });
    expect(dialog).toHaveAttribute("data-fullscreen", "true");
    expect(
      screen.getByRole("button", { name: "Exit fullscreen" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it("uses prefixed fullscreen APIs when a browser still exposes them", async () => {
    const webkitRequestFullscreenMock = vi.fn(() => {
      webkitFullscreenElement = document.querySelector(".gallery-slideshow");
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    const webkitExitFullscreenMock = vi.fn(() => {
      webkitFullscreenElement = null;
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "webkitRequestFullscreen", {
      configurable: true,
      value: webkitRequestFullscreenMock,
    });
    Object.defineProperty(document, "webkitFullscreenEnabled", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(document, "webkitFullscreenElement", {
      configurable: true,
      get: () => webkitFullscreenElement,
    });
    Object.defineProperty(document, "webkitExitFullscreen", {
      configurable: true,
      value: webkitExitFullscreenMock,
    });
    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
      await Promise.resolve();
    });
    expect(webkitRequestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(requestFullscreenMock).not.toHaveBeenCalled();

    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toHaveAttribute("data-fullscreen", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
      await Promise.resolve();
    });
    expect(webkitExitFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it("hides fullscreen chrome while idle and reveals it on interaction", async () => {
    setup({ intervalMs: 100000 });

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    await act(async () => {
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "Gallery slideshow" });
    expect(dialog).toHaveAttribute("data-chrome-hidden", "false");
    expect(screen.getByText("1 / 3")).not.toHaveClass(
      "gallery-slideshow__chrome--hidden",
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(dialog).toHaveAttribute("data-chrome-hidden", "true");
    expect(screen.getByText("1 / 3")).toHaveClass(
      "gallery-slideshow__chrome--hidden",
    );

    fireEvent.mouseMove(dialog);

    expect(dialog).toHaveAttribute("data-chrome-hidden", "false");
    expect(screen.getByText("1 / 3")).not.toHaveClass(
      "gallery-slideshow__chrome--hidden",
    );
  });

  it("Escape exits fullscreen before closing the slideshow", async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks fullscreen unavailable without closing when the API is unsupported", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => false,
    });
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(requestFullscreenMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toHaveAttribute("data-fullscreen-unavailable", "true");
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
