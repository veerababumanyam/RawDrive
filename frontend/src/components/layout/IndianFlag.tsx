"use client";

import { cn } from "@/lib/utils";

// IndianFlag — a small, authentic tricolor rendered inline as SVG.
//
// Why inline SVG (not a PNG or a CSS tricolor)?
//  - Crisp at every pixel density (navbar, mobile menu, retina screens).
//  - The Ashoka Chakra renders correctly at ~14px without aliasing.
//  - Colors live in the component, not scattered across design tokens —
//    these are official national colors and must not be themed.
//
// Official specification (Flag Code of India):
//   3:2 aspect ratio · saffron #FF9933 · white #FFFFFF · india-green #138808
//   navy-blue Ashoka Chakra #000080 with 24 evenly-spaced spokes
//
// Decorative-only: the wrapper is aria-hidden so the adjacent "RawDrive
// home" link keeps a clean accessible name. Sighted users still get the
// patriotic hover tooltip via the `title` attribute.

type IndianFlagProps = {
  className?: string;
  /** Hover tooltip shown to sighted users. Defaults to a warm patriotic line. */
  title?: string;
};

export function IndianFlag({
  className,
  title = "Proudly crafted in India",
}: IndianFlagProps) {
  return (
    <span
      aria-hidden="true"
      title={title}
      className={cn(
        // Tiny rounded badge with a soft ring that works across all three
        // themes (liquid-glass light/dark + midnight AMOLED gold) and on
        // top of the photographic hero on the landing page.
        "inline-flex shrink-0 overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-black/10 transition-transform duration-300 ease-out hover:scale-[1.08] dark:ring-white/15",
        className,
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 90 60"
        width="22"
        height="15"
        role="presentation"
        focusable="false"
      >
        {/* Tricolor bands */}
        <rect width="90" height="20" y="0" fill="#FF9933" />
        <rect width="90" height="20" y="20" fill="#FFFFFF" />
        <rect width="90" height="20" y="40" fill="#138808" />

        {/* Ashoka Chakra — 24 spokes, navy blue, centered in white band */}
        <g
          transform="translate(45 30)"
          fill="none"
          stroke="#000080"
          strokeWidth="0.55"
          strokeLinecap="round"
        >
          <circle r="7.5" />
          <circle r="1.1" fill="#000080" />
          {Array.from({ length: 24 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1="0"
              x2="0"
              y2="-7.2"
              transform={`rotate(${i * 15})`}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
