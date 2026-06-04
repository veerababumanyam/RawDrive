"use client";

/**
 * FaceBoxesOverlay — GAL-FR-089
 *
 * Renders face bounding boxes as an SVG overlay on top of the viewer image.
 * The boxes come from the backend AI pipeline (face_clusters table →
 * asset.face_boxes) in normalised [0,1] image-space coordinates, so this
 * component can position them without knowing the rendered pixel size —
 * it uses `preserveAspectRatio="xMidYMid meet"` to match how `object-contain`
 * lays out the image underneath.
 *
 * Toggle via the lightbox "Faces" action (I keyboard shortcut). When no
 * boxes are present the overlay is a no-op.
 */

import type { FaceBBox } from "@/lib/api/assets";

interface Props {
  boxes?: FaceBBox[];
  /** When false, the overlay is rendered but hidden — keeps layout stable. */
  visible: boolean;
}

export function FaceBoxesOverlay({ boxes, visible }: Props) {
  if (!visible || !boxes || boxes.length === 0) return null;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="xMidYMid meet"
    >
      {boxes.map((box, i) => (
        <rect
          key={`${box.x}-${box.y}-${i}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="none"
          // 2px stroke at 1x scale; vector-effect keeps the stroke crisp on zoom
          stroke="var(--text-media)"
          strokeOpacity="0.85"
          strokeWidth="0.004"
          vectorEffect="non-scaling-stroke"
          rx="0.006"
        />
      ))}
    </svg>
  );
}
