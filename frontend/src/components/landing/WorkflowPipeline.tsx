"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MessageSquare,
  Camera,
  UploadCloud,
  Sparkles,
  Heart,
  ReceiptText,
  Send,
} from "lucide-react";

/**
 * §4.2 Workflow Pipeline — "the wedding pipeline"
 *
 * Seven steps that explain what RawDrive does better than any feature grid:
 *
 *   Inquiry → Shoot → Upload → Cull → Proof → Invoice → Deliver
 *
 * Desktop (lg+): sticky row that stays pinned as the visitor scrolls
 * through its parent section. As scroll progresses, each step "lights up"
 * in order, and a thin progress bar underneath visualizes the completion.
 * The sticky release happens when the last step is lit and the parent
 * section scrolls past.
 *
 * Mobile (<lg): horizontal snap carousel. Sticky behavior is hostile to
 * mobile scroll UX, so we just let the user swipe through steps.
 *
 * Scroll progression is computed via `IntersectionObserver` for entry +
 * a passive scroll listener that reads `getBoundingClientRect()`. We set
 * a CSS custom property `--landing-pipeline-progress` (0 → 1) so the
 * progress bar width is pure CSS, and a discrete `data-active` attribute
 * on each step. No animation library, ~50 lines of JS.
 *
 * Respects `prefers-reduced-motion: reduce` — when set, all steps render
 * as active from mount and the sticky behavior is disabled by rendering
 * without the scroll listener.
 */

type PipelineStep = {
  icon: typeof MessageSquare;
  label: string;
  tagline: string;
};

const STEPS: PipelineStep[] = [
  { icon: MessageSquare, label: "Inquiry", tagline: "Lead captured and qualified" },
  { icon: Camera, label: "Shoot", tagline: "Calendar, crew, advance tracked" },
  { icon: UploadCloud, label: "Upload", tagline: "High-speed ingest with auto folders" },
  { icon: Sparkles, label: "Cull", tagline: "AI ranks every frame on quality" },
  { icon: Heart, label: "Proof", tagline: "Clients favorite from any device" },
  { icon: ReceiptText, label: "Invoice", tagline: "GST-ready billing in a click" },
  { icon: Send, label: "Deliver", tagline: "R2-backed secure download" },
];

/**
 * `useSyncExternalStore` is the correct React 18 primitive for subscribing
 * to external state (a media query, in this case) without tripping the
 * `react-hooks/set-state-in-effect` rule. The server snapshot is `false`
 * because SSR has no window; hydration picks up the real value.
 */
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReducedMotionSnapshot = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getReducedMotionServerSnapshot = () => false;

export function WorkflowPipeline() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  // Scroll-driven progression. We deliberately compute inside the event
  // handler (not inside the effect body) so we're synchronizing React
  // state with an external system (scroll position), which is the
  // intended use of useEffect.
  const updateProgress = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const viewportH = window.innerHeight;
    // Progress starts when the top of the section reaches the navbar,
    // and completes when the bottom of the scrollable region reaches
    // the bottom of the viewport. We use ~60% of section height as the
    // traveled distance so the pipeline finishes activating *before*
    // the section scrolls off.
    const travel = Math.max(1, section.offsetHeight - viewportH * 0.6);
    const scrolled = Math.min(
      travel,
      Math.max(0, -rect.top + viewportH * 0.2),
    );
    const ratio = scrolled / travel;
    setProgress(Math.min(1, Math.max(0, ratio)));
  }, []);

  useEffect(() => {
    // When the visitor prefers reduced motion, we don't attach the
    // scroll listener at all — `activeCount` below derives the final
    // "all lit" state directly from `reducedMotion`, so `progress`
    // stays at its initial 0 and the effect does nothing. This is
    // the pattern the react-hooks/set-state-in-effect rule wants us
    // to follow: subscribe to external updates, don't imperatively
    // write state from inside the effect body on mount.
    if (reducedMotion) return;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateProgress();
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [reducedMotion, updateProgress]);

  // Number of steps that should be "active" at the current progress.
  // With 7 steps and progress 0→1, we want each step lit as the
  // corresponding segment passes. `activeCount = ceil(progress * 7)`
  // with a small head-start so step 1 is lit immediately on entry.
  const activeCount = reducedMotion
    ? STEPS.length
    : Math.min(STEPS.length, Math.max(1, Math.ceil(progress * STEPS.length + 0.3)));

  return (
    <section
      ref={sectionRef}
      aria-labelledby="pipeline-heading"
      className="landing-pipeline mx-auto max-w-7xl px-6 sm:px-8 lg:px-12"
      style={{ ["--landing-pipeline-progress" as string]: String(progress) }}
    >
      <div className="landing-pipeline__sticky">
        <div className="mb-10 max-w-2xl">
          <p className="font-headline text-xs font-semibold uppercase tracking-[0.32em] text-text-tertiary">
            The wedding pipeline
          </p>
          <h2
            id="pipeline-heading"
            className="mt-4 font-headline text-3xl font-bold leading-tight tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
          >
            Seven steps. One studio.
          </h2>
        </div>

        <div
          className="landing-pipeline__row"
          role="list"
          aria-label="Wedding workflow pipeline"
        >
          {STEPS.map((step, index) => {
            const isActive = index < activeCount;
            const Icon = step.icon;
            return (
              <div key={step.label} className="contents">
                <div
                  role="listitem"
                  data-active={isActive ? "true" : "false"}
                  className="landing-pipeline__step"
                >
                  <div className="landing-pipeline__step-icon" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="landing-pipeline__step-label">
                    {index + 1}. {step.label}
                  </div>
                  <div className="landing-pipeline__step-tagline">{step.tagline}</div>
                </div>
                {index < STEPS.length - 1 ? (
                  <div
                    aria-hidden="true"
                    data-active={index < activeCount - 1 ? "true" : "false"}
                    className="landing-pipeline__connector"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="landing-pipeline__progress" aria-hidden="true">
          <span className="landing-pipeline__progress-bar" />
        </div>
      </div>
    </section>
  );
}
