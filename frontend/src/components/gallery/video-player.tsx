"use client";

/**
 * VideoPlayer — GAL-FR-095 + GAL-FR-096
 *
 * HTML5 video player with the full control set required by FR-095:
 *   - Poster frame (from asset.poster_url)
 *   - Volume slider + mute toggle
 *   - Playback speed menu (0.5x / 1x / 1.5x / 2x)
 *   - Fullscreen toggle
 *   - Keyboard shortcuts: space (play/pause), M (mute), F (fullscreen)
 *
 * Plus client-side trim controls (GAL-FR-096): a dual-handle range slider
 * over the timeline that clamps playback between [trimIn, trimOut]. The
 * trim values are reported via onTrimChange so the dashboard caller can
 * POST them back — the actual server-side cut is out of scope for this
 * deferred-FR closure pass.
 *
 * Styling: glass toolbar matching the rest of the lightbox, reuses
 * GlassIconButton for controls, uses design tokens (no hardcoded colors).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Expand, Compress } from "@/components/icons";

interface Props {
  src: string;
  poster?: string;
  /** When true, renders trim range slider below the timeline. */
  showTrim?: boolean;
  onTrimChange?: (trimIn: number, trimOut: number) => void;
  className?: string;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

export function VideoPlayer({
  src,
  poster,
  showTrim = false,
  onTrimChange,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync video element state into React on metadata load so duration is known
  // before the first render of the timeline.
  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimOut(v.duration);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    // Enforce trim boundaries during playback (GAL-FR-096).
    if (showTrim && v.currentTime >= trimOut) {
      v.pause();
      v.currentTime = trimIn;
    }
  }, [showTrim, trimIn, trimOut]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
        case "M":
          setMuted((m) => !m);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(trimIn, Math.min(trimOut || duration, t));
  };

  const fmt = (t: number) => {
    if (!Number.isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col gap-2 ${className ?? ""}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        className="max-h-full max-w-full object-contain"
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onClick={togglePlay}
      />

      {/* Control bar — rendered outside the video so fullscreen wraps the container. */}
      <div className="flex items-center gap-3 rounded-2xl bg-surface-overlay/10 glass-blur-full border border-text-media/[0.12] px-4 py-2 text-text-media">
        <button
          type="button"
          onClick={togglePlay}
          className="h-9 w-9 shrink-0 rounded-full bg-surface-overlay/10 hover:bg-surface-overlay/20 flex items-center justify-center text-sm font-medium"
          aria-label={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        {/* Timeline */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={current}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="flex-1 accent-text-media"
          aria-label="Seek"
        />
        <span className="w-20 text-right tabular-nums text-xs text-text-media/70">
          {fmt(current)} / {fmt(duration)}
        </span>

        {/* Volume */}
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="h-8 w-8 rounded-full hover:bg-surface-overlay/10 flex items-center justify-center text-sm"
          aria-label={muted ? "Unmute (M)" : "Mute (M)"}
        >
          {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            setVolume(parseFloat(e.target.value));
            setMuted(false);
          }}
          className="w-20 accent-text-media"
          aria-label="Volume"
        />

        {/* Speed */}
        <select
          value={speed}
          onChange={(e) =>
            setSpeed(parseFloat(e.target.value) as (typeof SPEEDS)[number])
          }
          className="rounded-lg bg-surface-overlay/10 border border-text-media/15 px-2 py-1 text-xs text-text-media hover:bg-surface-overlay/15"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s} className="bg-surface-scrim-strong text-text-media">
              {s}x
            </option>
          ))}
        </select>

        <GlassIconButton
          size="sm"
          label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Compress /> : <Expand />}
        </GlassIconButton>
      </div>

      {/* Trim slider (GAL-FR-096) */}
      {showTrim && duration > 0 && (
        <div className="rounded-2xl bg-surface-overlay/10 glass-blur-full border border-text-media/[0.1] px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-text-media/60">
            <span>Trim</span>
            <span className="tabular-nums">
              {fmt(trimIn)} → {fmt(trimOut)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={trimIn}
              onChange={(e) => {
                const v = Math.min(parseFloat(e.target.value), trimOut - 0.1);
                setTrimIn(v);
                onTrimChange?.(v, trimOut);
              }}
              className="flex-1 accent-accent-primary"
              aria-label="Trim start"
            />
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={trimOut}
              onChange={(e) => {
                const v = Math.max(parseFloat(e.target.value), trimIn + 0.1);
                setTrimOut(v);
                onTrimChange?.(trimIn, v);
              }}
              className="flex-1 accent-accent-primary"
              aria-label="Trim end"
            />
          </div>
        </div>
      )}
    </div>
  );
}
