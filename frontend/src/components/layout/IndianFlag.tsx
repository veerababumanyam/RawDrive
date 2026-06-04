"use client";

import { cn } from "@/lib/utils";

// IndianFlag — a small, authentic tricolor rendered inline as SVG.
//
// Why inline SVG (not a PNG or a CSS tricolor)?
//  - Crisp at every pixel density (navbar, mobile menu, retina screens).
//  - The Ashoka Chakra renders correctly at ~14px without aliasing.
//  - Colors are fixed official values, exposed as named tokens so the
//    component does not inline visual constants.
//
// Official specification (Flag Code of India):
//   3:2 aspect ratio · saffron · white · india-green
//   navy-blue Ashoka Chakra with 24 evenly-spaced spokes
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
        "national-flag-frame inline-flex shrink-0 overflow-hidden",
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
        <rect width="90" height="20" y="0" fill="var(--india-flag-saffron)" />
        <rect width="90" height="20" y="20" fill="var(--india-flag-white)" />
        <rect width="90" height="20" y="40" fill="var(--india-flag-green)" />

        {/* Ashoka Chakra — 24 spokes, navy blue, centered in white band */}
        <g
          transform="translate(45 30)"
          fill="none"
          stroke="var(--india-flag-chakra)"
          strokeWidth="0.55"
          strokeLinecap="round"
        >
          <circle r="7.5" />
          <circle r="1.1" fill="var(--india-flag-chakra)" />
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
