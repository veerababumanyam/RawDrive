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
  ChevronLeft,
  ChevronRight,
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

/**
 * Full-screen autoplay slideshow over a public gallery's photos, with optional
 * looping background music. Mounted only while active (the parent gates it), so
 * it always starts fresh — no reset-on-open effect, no hydration concerns.
 *
 * Autoplay policy: browsers block audio autoplay with sound until a user
 * gesture, so music starts muted; the client taps the volume control to enable
 * sound. Image auto-advance is unaffected.
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
  const [muted, setMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
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
  }, [next, prev, onClose]);

  // Sync the <audio> element with play/mute state (external-system sync).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicUrl) return;
    audio.muted = muted;
    if (playing) {
      try {
        const p = audio.play?.();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* autoplay blocked or unsupported (e.g. jsdom) — non-fatal */
      }
    } else {
      audio.pause?.();
    }
  }, [playing, muted, musicUrl]);

  if (count === 0) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Gallery slideshow"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/95"
    >
      {renderSlide ? (
        renderSlide(index)
      ) : (
        <img
          src={images ? images[index] : ""}
          alt={`Slide ${index + 1} of ${count}`}
          className="max-h-full max-w-full object-contain"
        />
      )}

      {musicUrl ? (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          data-testid="slideshow-audio"
        />
      ) : null}

      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-sm text-text-media/80">
        {index + 1} / {count}
      </div>

      <div className="absolute right-4 top-4">
        <GlassIconButton
          label="Close slideshow"
          onClick={onClose}
          size="md"
          variant="glass"
        >
          <XMark />
        </GlassIconButton>
      </div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3">
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
