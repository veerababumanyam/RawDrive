"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  addFullscreenListeners,
  exitFullscreenDocument,
  getFullscreenElement,
  isFullscreenSupportedForElement,
  requestElementFullscreen,
} from "@/lib/browser-fullscreen";
import {
  ChevronLeft,
  ChevronRight,
  Compress,
  Expand,
  Pause,
  Play,
  Volume,
  VolumeOff,
  XMark,
} from "@/components/icons";

interface GallerySlideshowProps {
  /**
   * Resolved, displayable image URLs in slide order. Used for the simple case
   * (and tests). For the public gallery — where images stream through the
   * client-side media-encryption pipeline — pass `slideCount` + `renderSlide`
   * instead so each slide renders via the same decryption hook the grid uses.
   */
  images?: string[];
  /** Slide count when using `renderSlide` (ignored if `images` is provided). */
  slideCount?: number;
  /** Custom per-slide renderer (overrides the default `<img>`). */
  renderSlide?: (index: number) => ReactNode;
  /** Optional background music URL (the gallery's audio asset, served by the API). */
  musicUrl?: string | null;
  /** Auto-advance interval in ms. */
  intervalMs?: number;
  /** Slide to open on. */
  startIndex?: number;
  /** Close handler — the parent unmounts this component (mounted = open). */
  onClose: () => void;
}

const FULLSCREEN_CHROME_IDLE_MS = 3000;

export function SlideshowImageFrame({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="gallery-slideshow__media-frame">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="gallery-slideshow__ambient-image"
        decoding="async"
      />
      <div className="gallery-slideshow__ambient-scrim" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className="gallery-slideshow__image"
        decoding="async"
      />
    </div>
  );
}

/**
 * Full-screen autoplay slideshow over a public gallery's photos, with optional
 * looping background music. Mounted only while active (the parent gates it), so
 * it always starts fresh — no reset-on-open effect, no hydration concerns.
 *
 * Autoplay policy: music starts UNMUTED and we attempt to play immediately.
 * Most browsers block UNMUTED audio autoplay until the page has seen a user
 * gesture, so when the initial play() rejects we register a one-time
 * document-level pointer/key/touch listener that retries play() (still
 * unmuted) on the viewer's first interaction, then removes itself. The viewer
 * can mute at any time via the volume control. Image auto-advance is
 * unaffected.
 */
export function GallerySlideshow({
  images,
  slideCount,
  renderSlide,
  musicUrl,
  intervalMs = 5000,
  startIndex = 0,
  onClose,
}: GallerySlideshowProps) {
  const count = images?.length ?? slideCount ?? 0;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)),
  );
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chromeTimerRef = useRef<number | null>(null);
  // a11y: fullscreen modal dialog (aria-modal) — move focus in on open, trap
  // Tab within it, restore focus to the launcher on close. Mounted == open, so
  // the trap is engaged for the whole lifetime.
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true);

  const next = useCallback(
    () => setIndex((i) => (count ? (i + 1) % count : 0)),
    [count],
  );
  const prev = useCallback(
    () => setIndex((i) => (count ? (i - 1 + count) % count : 0)),
    [count],
  );

  const clearChromeTimer = useCallback(() => {
    if (!chromeTimerRef.current) return;
    window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = null;
  }, []);

  const startChromeTimer = useCallback(() => {
    clearChromeTimer();
    if (!isFullscreen) return;
    chromeTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      chromeTimerRef.current = null;
    }, FULLSCREEN_CHROME_IDLE_MS);
  }, [clearChromeTimer, isFullscreen]);

  const resetChromeTimer = useCallback(() => {
    setChromeVisible(true);
    startChromeTimer();
  }, [startChromeTimer]);

  const exitFullscreen = useCallback(() => {
    if (!getFullscreenElement(document)) return;
    const request = exitFullscreenDocument(document);
    if (request && typeof request.catch === "function") request.catch(() => {});
  }, []);

  const closeSlideshow = useCallback(() => {
    exitFullscreen();
    onClose();
  }, [exitFullscreen, onClose]);

  const toggleFullscreen = useCallback(() => {
    if (getFullscreenElement(document)) {
      const request = exitFullscreenDocument(document);
      if (request && typeof request.catch === "function") {
        request.catch(() => setFullscreenUnavailable(true));
      }
      return;
    }

    const target = containerRef.current;
    if (!isFullscreenSupportedForElement(target, document)) {
      setFullscreenUnavailable(true);
      return;
    }

    try {
      const request = requestElementFullscreen(target, {
        navigationUI: "hide",
      });
      if (request && typeof request.catch === "function") {
        request.catch(() => setFullscreenUnavailable(true));
      }
    } catch {
      setFullscreenUnavailable(true);
    }
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      const activeFullscreenElement = getFullscreenElement(document);
      setIsFullscreen(Boolean(activeFullscreenElement));
      if (activeFullscreenElement) setFullscreenUnavailable(false);
    };
    const onFullscreenError = () => setFullscreenUnavailable(true);
    const settleFullscreenTimer = window.setTimeout(syncFullscreenState, 0);
    const lateFullscreenTimer = window.setTimeout(syncFullscreenState, 250);

    syncFullscreenState();
    const removeFullscreenListeners = addFullscreenListeners(
      document,
      syncFullscreenState,
      onFullscreenError,
    );
    return () => {
      window.clearTimeout(settleFullscreenTimer);
      window.clearTimeout(lateFullscreenTimer);
      removeFullscreenListeners();
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return clearChromeTimer;
    startChromeTimer();
    return clearChromeTimer;
  }, [clearChromeTimer, isFullscreen, startChromeTimer]);

  // Auto-advance. The setState lives in the interval callback (async), not the
  // effect body, so it does not trigger cascading-render lint.
  useEffect(() => {
    if (!playing || count <= 1) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [playing, count, intervalMs]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      resetChromeTimer();
      if (e.key === "Escape") {
        if (getFullscreenElement(document)) {
          e.preventDefault();
          exitFullscreen();
          return;
        }
        onClose();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
        return;
      } else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key.toLowerCase() === "m") {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitFullscreen, next, prev, onClose, resetChromeTimer, toggleFullscreen]);

  // Sync the <audio> element with play/mute state and start the music WITH
  // SOUND as early as the browser permits.
  //
  // Browsers (Chrome/Safari/Firefox) block UNMUTED audio autoplay until the
  // page has had a user gesture — a non-bypassable anti-annoyance policy, so
  // "sound on cold load with zero interaction" is impossible on the web. We do
  // the maximum the platform allows:
  //   1. Try to play UNMUTED (succeeds for returning visitors / high media
  //      engagement / once the page has had any prior gesture).
  //   2. If blocked, immediately play MUTED — which IS allowed — so the track
  //      is already running and in sync, then UNMUTE on the very first
  //      interaction of ANY kind (click, key, tap — anywhere on the page), so
  //      the visitor never has to find the unmute control.
  // An explicit mute (the mute button → `muted` state) is always respected and
  // suppresses the auto-unmute.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicUrl) return;

    if (!playing) {
      audio.pause?.();
      return;
    }

    audio.muted = muted;

    const gestureEvents = ["pointerdown", "keydown", "touchstart"] as const;
    let cleanedUp = false;
    const removeGestureListener = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const evt of gestureEvents) {
        document.removeEventListener(evt, onFirstGesture);
      }
    };
    // First real interaction → bring the sound on (unless the user chose mute).
    const onFirstGesture = () => {
      removeGestureListener();
      const el = audioRef.current;
      if (!el || muted) return;
      el.muted = false;
      try {
        const p = el.play?.();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* non-fatal */
      }
    };

    try {
      const p = audio.play?.();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Unmuted autoplay blocked. Play MUTED now so the track is running
          // and in sync, then unmute on the first user gesture. Guard against
          // an unmount racing this pending rejection.
          if (cleanedUp) return;
          const el = audioRef.current;
          if (!el || muted) return;
          el.muted = true;
          try {
            const mp = el.play?.();
            if (mp && typeof mp.catch === "function") mp.catch(() => {});
          } catch {
            /* non-fatal */
          }
          for (const evt of gestureEvents) {
            document.addEventListener(evt, onFirstGesture, { once: false });
          }
        });
      }
    } catch {
      /* autoplay blocked or unsupported (e.g. jsdom) — non-fatal */
    }

    return removeGestureListener;
  }, [playing, muted, musicUrl]);

  if (count === 0) return null;

  const fullscreenChromeHidden = isFullscreen && !chromeVisible;
  const chromeClass = fullscreenChromeHidden
    ? " gallery-slideshow__chrome--hidden"
    : "";

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Gallery slideshow"
      tabIndex={-1}
      data-glass-surface="media"
      data-fullscreen={isFullscreen ? "true" : "false"}
      data-fullscreen-unavailable={fullscreenUnavailable ? "true" : "false"}
      data-chrome-hidden={fullscreenChromeHidden ? "true" : "false"}
      className="gallery-slideshow"
      onFocusCapture={resetChromeTimer}
      onMouseMove={resetChromeTimer}
      onPointerDown={resetChromeTimer}
    >
      <div className="gallery-slideshow__stage">
        {renderSlide ? (
          renderSlide(index)
        ) : (
          <SlideshowImageFrame
            src={images ? images[index] : ""}
            alt={`Slide ${index + 1} of ${count}`}
          />
        )}
      </div>

      {musicUrl ? (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          data-testid="slideshow-audio"
        />
      ) : null}

      <div
        className={`gallery-slideshow__counter gallery-slideshow__chrome${chromeClass}`}
      >
        {index + 1} / {count}
      </div>

      <div
        className={`gallery-slideshow__close gallery-slideshow__chrome${chromeClass}`}
      >
        <GlassIconButton
          label="Close slideshow"
          onClick={closeSlideshow}
          size="md"
          variant="glass"
        >
          <XMark />
        </GlassIconButton>
      </div>

      <div
        className={`gallery-slideshow__controls gallery-slideshow__chrome${chromeClass}`}
      >
        <GlassIconButton
          label="Previous slide"
          onClick={prev}
          size="md"
          variant="glass"
        >
          <ChevronLeft />
        </GlassIconButton>
        <GlassIconButton
          label={playing ? "Pause slideshow" : "Play slideshow"}
          onClick={() => setPlaying((p) => !p)}
          size="lg"
          variant="glass"
          active={playing}
          className="gallery-slideshow__primary-control"
        >
          {playing ? <Pause /> : <Play />}
        </GlassIconButton>
        <GlassIconButton
          label="Next slide"
          onClick={next}
          size="md"
          variant="glass"
        >
          <ChevronRight />
        </GlassIconButton>
        <GlassIconButton
          label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
          size="md"
          variant="glass"
          active={isFullscreen}
        >
          {isFullscreen ? <Compress /> : <Expand />}
        </GlassIconButton>
        {musicUrl ? (
          <GlassIconButton
            label={muted ? "Unmute music" : "Mute music"}
            onClick={() => setMuted((m) => !m)}
            size="md"
            variant="glass"
            active={!muted}
          >
            {muted ? <VolumeOff /> : <Volume />}
          </GlassIconButton>
        ) : null}
      </div>
    </div>
  );
}
