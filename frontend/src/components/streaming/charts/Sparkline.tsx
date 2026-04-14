"use client";

/**
 * Sparkline — inline SVG line chart primitive.
 * Pure SVG, zero deps. Stroke resolves to design-token CSS var.
 */

export interface SparklinePoint {
  x: string | number;
  y: number;
}

export type SparklineStroke = "accent" | "success" | "warning" | "danger";

export interface SparklineProps {
  points: SparklinePoint[];
  height?: number;
  width?: number;
  ariaLabel: string;
  strokeToken?: SparklineStroke;
  className?: string;
}

const tokenToVar: Record<SparklineStroke, string> = {
  accent: "var(--color-accent)",
  success: "var(--color-feedback-success)",
  warning: "var(--color-feedback-warning)",
  danger: "var(--color-feedback-error)",
};

// Tailwind v4 picks the focus ring color from --color-focus-ring (design token).
const focusClasses =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-sm";

function describeTrend(points: SparklinePoint[]): string {
  if (points.length === 0) return "no data";
  if (points.length === 1) return `${points.length} data point`;
  const first = points[0].y;
  const last = points[points.length - 1].y;
  const direction =
    last > first ? "trending up" : last < first ? "trending down" : "flat";
  return `${points.length} data points, ${direction}`;
}

export function Sparkline({
  points,
  height = 48,
  width = 160,
  ariaLabel,
  strokeToken = "accent",
  className,
}: SparklineProps) {
  const stroke = tokenToVar[strokeToken];
  const trendDesc = `${ariaLabel}: ${describeTrend(points)}`;
  const svgClassName = [focusClasses, className ?? ""].join(" ").trim();
  if (points.length === 0) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={svgClassName}
      >
        <title>{trendDesc}</title>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={stroke}
          strokeOpacity={0.3}
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;

  const coords = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.y - minY) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={svgClassName}
    >
      <title>{trendDesc}</title>
      <polyline
        points={coords}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
