/**
 * AnalyticsChart Component
 *
 * A versatile chart component for displaying analytics data in various formats:
 * - Line charts (time series data like views over time)
 * - Bar charts (comparisons, breakdowns)
 * - Pie/Donut charts (percentage breakdowns like device distribution)
 * - Area charts (time series with filled area)
 *
 * Built with pure SVG for lightweight rendering without external chart library dependencies.
 *
 * Feature: Analytics & Reporting
 * Task: T032 - Create AnalyticsChart component
 */

import React, { useMemo, useId } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/AppCard';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartType = 'line' | 'bar' | 'pie' | 'donut' | 'area';

export interface DataPoint {
  /** X-axis label (e.g., date, category name) */
  label: string;
  /** Primary value */
  value: number;
  /** Secondary value (optional, for dual-axis charts) */
  secondaryValue?: number;
  /** Color override for this data point */
  color?: string;
}

export interface ChartSeries {
  /** Unique identifier for the series */
  id: string;
  /** Display name for the series */
  name: string;
  /** Data points in the series */
  data: DataPoint[];
  /** Color for the series */
  color?: string;
}

export interface AnalyticsChartProps {
  /** Chart title */
  title: string;
  /** Chart subtitle or description */
  subtitle?: string;
  /** Type of chart to render */
  type: ChartType;
  /** Single series of data points */
  data?: DataPoint[];
  /** Multiple series for comparison charts */
  series?: ChartSeries[];
  /** Chart height in pixels (default: 300) */
  height?: number;
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to show legend */
  showLegend?: boolean;
  /** Whether to show tooltips on hover */
  showTooltips?: boolean;
  /** Whether to show data labels */
  showLabels?: boolean;
  /** Whether the chart is in loading state */
  isLoading?: boolean;
  /** Whether there was an error loading data */
  isError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Trend value to display in header (percentage change) */
  trend?: number;
  /** Label for the trend period */
  trendLabel?: string;
  /** Additional CSS classes */
  className?: string;
  /** Format function for values */
  formatValue?: (value: number) => string;
  /** Format function for labels */
  formatLabel?: (label: string) => string;
  /** Colors for the chart (overrides default palette) */
  colors?: string[];
  /** Empty state message */
  emptyMessage?: string;
  /** X-axis label */
  xAxisLabel?: string;
  /** Y-axis label */
  yAxisLabel?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default color palette for charts */
const DEFAULT_COLORS = [
  '#3B82F6', // blue-500
  '#22C55E', // green-500
  '#A855F7', // purple-500
  '#F97316', // orange-500
  '#06B6D4', // cyan-500
  '#EC4899', // pink-500
  '#EAB308', // yellow-500
  '#6366F1', // indigo-500
];

/** Chart padding */
const CHART_PADDING = {
  top: 20,
  right: 20,
  bottom: 40,
  left: 50,
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the appropriate icon for a chart type
 */
function getChartIcon(type: ChartType): LucideIcon {
  switch (type) {
    case 'line':
      return LineChart;
    case 'bar':
      return BarChart3;
    case 'pie':
    case 'donut':
      return PieChart;
    case 'area':
      return AreaChart;
    default:
      return BarChart3;
  }
}

/**
 * Format a number with compact notation
 */
function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

/**
 * Calculate tick values for Y axis
 */
function calculateYTicks(minValue: number, maxValue: number, tickCount = 5): number[] {
  const range = maxValue - minValue;
  const step = range / (tickCount - 1);
  const ticks: number[] = [];

  for (let i = 0; i < tickCount; i++) {
    ticks.push(minValue + step * i);
  }

  return ticks;
}

/**
 * Generate SVG path for a line or area chart
 */
function generateLinePath(
  points: { x: number; y: number }[],
  smooth = true
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  if (!smooth) {
    return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  }

  // Catmull-Rom to Bezier conversion for smooth curves
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

/**
 * Generate SVG path for pie/donut chart segments
 */
function generateArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  innerRadius = 0
): string {
  const startRad = (startAngle - 90) * (Math.PI / 180);
  const endRad = (endAngle - 90) * (Math.PI / 180);

  const x1 = centerX + radius * Math.cos(startRad);
  const y1 = centerY + radius * Math.sin(startRad);
  const x2 = centerX + radius * Math.cos(endRad);
  const y2 = centerY + radius * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  if (innerRadius > 0) {
    const x3 = centerX + innerRadius * Math.cos(endRad);
    const y3 = centerY + innerRadius * Math.sin(endRad);
    const x4 = centerX + innerRadius * Math.cos(startRad);
    const y4 = centerY + innerRadius * Math.sin(startRad);

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
  }

  return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

// ---------------------------------------------------------------------------
// Loading Skeleton Component
// ---------------------------------------------------------------------------

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{ height }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-700" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-zinc-700 rounded mb-2" />
          <div className="h-3 w-24 bg-zinc-700 rounded" />
        </div>
      </div>
      <div className="h-full bg-zinc-700/50 rounded-lg flex items-end justify-around px-4 pb-4 gap-2">
        {[40, 60, 35, 80, 55, 45, 70].map((h, i) => (
          <div
            key={i}
            className="bg-zinc-600 rounded-t"
            style={{ height: `${h}%`, width: '10%' }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State Component
// ---------------------------------------------------------------------------

function EmptyState({ message, type }: { message: string; type: ChartType }) {
  const Icon = getChartIcon(type);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-text-tertiary">
      <Icon className="w-12 h-12 mb-3 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State Component
// ---------------------------------------------------------------------------

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-red-500">
      <div className="w-12 h-12 mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
        <span className="text-2xl">!</span>
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line Chart Component
// ---------------------------------------------------------------------------

interface LineChartProps {
  data: DataPoint[];
  series?: ChartSeries[];
  width: number;
  height: number;
  colors: string[];
  showGrid: boolean;
  showLabels: boolean;
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
}

function LineChartRenderer({
  data,
  series,
  width,
  height,
  colors,
  showGrid,
  formatValue,
  formatLabel,
}: LineChartProps) {
  const chartId = useId();

  const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  // Calculate bounds
  const allValues = series
    ? series.flatMap((s) => s.data.map((d) => d.value))
    : data.map((d) => d.value);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues) * 1.1; // Add 10% padding
  const yTicks = calculateYTicks(minValue, maxValue);

  // Generate points
  const dataSeries = series || [{ id: 'default', name: 'Values', data, color: colors[0] }];
  const pointCount = dataSeries[0]?.data.length || 0;
  const xStep = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        {dataSeries.map((s, idx) => (
          <linearGradient
            key={s.id}
            id={`${chartId}-gradient-${idx}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={s.color || colors[idx]} stopOpacity={0.3} />
            <stop offset="100%" stopColor={s.color || colors[idx]} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>

      {/* Grid lines */}
      {showGrid && (
        <g className="text-zinc-700">
          {yTicks.map((tick, i) => {
            const y = CHART_PADDING.top + chartHeight - ((tick - minValue) / (maxValue - minValue)) * chartHeight;
            return (
              <line
                key={i}
                x1={CHART_PADDING.left}
                y1={y}
                x2={width - CHART_PADDING.right}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : '4,4'}
              />
            );
          })}
        </g>
      )}

      {/* Y-axis labels */}
      <g className="text-text-tertiary text-xs">
        {yTicks.map((tick, i) => {
          const y = CHART_PADDING.top + chartHeight - ((tick - minValue) / (maxValue - minValue)) * chartHeight;
          return (
            <text
              key={i}
              x={CHART_PADDING.left - 8}
              y={y + 4}
              textAnchor="end"
              fill="currentColor"
            >
              {formatValue(tick)}
            </text>
          );
        })}
      </g>

      {/* X-axis labels */}
      <g className="text-text-tertiary text-xs">
        {dataSeries[0]?.data.map((d, i) => {
          // Only show every nth label to avoid crowding
          const showLabel = pointCount <= 10 || i % Math.ceil(pointCount / 8) === 0;
          if (!showLabel) return null;

          const x = CHART_PADDING.left + i * xStep;
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fill="currentColor"
            >
              {formatLabel(d.label)}
            </text>
          );
        })}
      </g>

      {/* Lines and area fills */}
      {dataSeries.map((s, idx) => {
        const points = s.data.map((d, i) => ({
          x: CHART_PADDING.left + i * xStep,
          y: CHART_PADDING.top + chartHeight - ((d.value - minValue) / (maxValue - minValue)) * chartHeight,
        }));

        const linePath = generateLinePath(points);
        const areaPath = linePath + ` L ${points[points.length - 1].x} ${CHART_PADDING.top + chartHeight} L ${points[0].x} ${CHART_PADDING.top + chartHeight} Z`;

        return (
          <g key={s.id}>
            {/* Area fill */}
            <path
              d={areaPath}
              fill={`url(#${chartId}-gradient-${idx})`}
            />
            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={s.color || colors[idx]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Data points */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill={s.color || colors[idx]}
                className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bar Chart Component
// ---------------------------------------------------------------------------

interface BarChartProps {
  data: DataPoint[];
  series?: ChartSeries[];
  width: number;
  height: number;
  colors: string[];
  showGrid: boolean;
  showLabels: boolean;
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
}

function BarChartRenderer({
  data,
  series,
  width,
  height,
  colors,
  showGrid,
  showLabels,
  formatValue,
  formatLabel,
}: BarChartProps) {
  const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const dataSeries = series || [{ id: 'default', name: 'Values', data, color: colors[0] }];
  const barCount = dataSeries[0]?.data.length || 0;
  const seriesCount = dataSeries.length;
  const groupWidth = chartWidth / barCount;
  const barWidth = (groupWidth * 0.8) / seriesCount;
  const barGap = groupWidth * 0.1;

  // Calculate bounds
  const allValues = dataSeries.flatMap((s) => s.data.map((d) => d.value));
  const maxValue = Math.max(...allValues) * 1.1;
  const yTicks = calculateYTicks(0, maxValue);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Grid lines */}
      {showGrid && (
        <g className="text-zinc-700">
          {yTicks.map((tick, i) => {
            const y = CHART_PADDING.top + chartHeight - (tick / maxValue) * chartHeight;
            return (
              <line
                key={i}
                x1={CHART_PADDING.left}
                y1={y}
                x2={width - CHART_PADDING.right}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : '4,4'}
              />
            );
          })}
        </g>
      )}

      {/* Y-axis labels */}
      <g className="text-text-tertiary text-xs">
        {yTicks.map((tick, i) => {
          const y = CHART_PADDING.top + chartHeight - (tick / maxValue) * chartHeight;
          return (
            <text
              key={i}
              x={CHART_PADDING.left - 8}
              y={y + 4}
              textAnchor="end"
              fill="currentColor"
            >
              {formatValue(tick)}
            </text>
          );
        })}
      </g>

      {/* Bars */}
      {dataSeries.map((s, sIdx) =>
        s.data.map((d, i) => {
          const barHeight = (d.value / maxValue) * chartHeight;
          const x = CHART_PADDING.left + barGap + i * groupWidth + sIdx * barWidth;
          const y = CHART_PADDING.top + chartHeight - barHeight;

          return (
            <g key={`${s.id}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={d.color || s.color || colors[sIdx]}
                rx={4}
                className="transition-opacity hover:opacity-80 cursor-pointer"
              />
              {showLabels && (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="text-xs fill-text-secondary"
                >
                  {formatValue(d.value)}
                </text>
              )}
            </g>
          );
        })
      )}

      {/* X-axis labels */}
      <g className="text-text-tertiary text-xs">
        {dataSeries[0]?.data.map((d, i) => {
          const x = CHART_PADDING.left + i * groupWidth + groupWidth / 2;
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fill="currentColor"
            >
              {formatLabel(d.label)}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pie/Donut Chart Component
// ---------------------------------------------------------------------------

interface PieChartProps {
  data: DataPoint[];
  width: number;
  height: number;
  colors: string[];
  isDonut: boolean;
  showLabels: boolean;
  formatValue: (value: number) => string;
}

function PieChartRenderer({
  data,
  width,
  height,
  colors,
  isDonut,
  showLabels,
  formatValue,
}: PieChartProps) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 20;
  const innerRadius = isDonut ? radius * 0.6 : 0;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  const segments = data.map((d, i) => {
    const startAngle = currentAngle;
    const angle = (d.value / total) * 360;
    currentAngle += angle;
    const endAngle = currentAngle;

    return {
      ...d,
      startAngle,
      endAngle,
      percentage: (d.value / total) * 100,
      color: d.color || colors[i % colors.length],
    };
  });

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Segments */}
      {segments.map((segment, i) => (
        <path
          key={i}
          d={generateArcPath(centerX, centerY, radius, segment.startAngle, segment.endAngle, innerRadius)}
          fill={segment.color}
          className="transition-opacity hover:opacity-80 cursor-pointer"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth={1}
        />
      ))}

      {/* Center text for donut */}
      {isDonut && (
        <g className="text-text-primary">
          <text
            x={centerX}
            y={centerY - 8}
            textAnchor="middle"
            className="text-2xl font-bold"
            fill="currentColor"
          >
            {formatValue(total)}
          </text>
          <text
            x={centerX}
            y={centerY + 12}
            textAnchor="middle"
            className="text-xs text-text-tertiary"
            fill="currentColor"
          >
            Total
          </text>
        </g>
      )}

      {/* Labels */}
      {showLabels && (
        <g className="text-text-secondary text-xs">
          {segments.map((segment, i) => {
            const midAngle = (segment.startAngle + segment.endAngle) / 2;
            const midRad = (midAngle - 90) * (Math.PI / 180);
            const labelRadius = radius + 20;
            const x = centerX + labelRadius * Math.cos(midRad);
            const y = centerY + labelRadius * Math.sin(midRad);

            if (segment.percentage < 5) return null;

            return (
              <text
                key={i}
                x={x}
                y={y}
                textAnchor={x > centerX ? 'start' : 'end'}
                fill="currentColor"
              >
                {segment.label}: {segment.percentage.toFixed(1)}%
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Area Chart Component
// ---------------------------------------------------------------------------

interface AreaChartProps {
  data: DataPoint[];
  series?: ChartSeries[];
  width: number;
  height: number;
  colors: string[];
  showGrid: boolean;
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
}

function AreaChartRenderer({
  data,
  series,
  width,
  height,
  colors,
  showGrid,
  formatValue,
  formatLabel,
}: AreaChartProps) {
  const chartId = useId();

  const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const dataSeries = series || [{ id: 'default', name: 'Values', data, color: colors[0] }];
  const allValues = dataSeries.flatMap((s) => s.data.map((d) => d.value));
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues) * 1.1;
  const yTicks = calculateYTicks(minValue, maxValue);

  const pointCount = dataSeries[0]?.data.length || 0;
  const xStep = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        {dataSeries.map((s, idx) => (
          <linearGradient
            key={s.id}
            id={`${chartId}-area-gradient-${idx}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={s.color || colors[idx]} stopOpacity={0.5} />
            <stop offset="100%" stopColor={s.color || colors[idx]} stopOpacity={0.05} />
          </linearGradient>
        ))}
      </defs>

      {/* Grid */}
      {showGrid && (
        <g className="text-zinc-700">
          {yTicks.map((tick, i) => {
            const y = CHART_PADDING.top + chartHeight - ((tick - minValue) / (maxValue - minValue)) * chartHeight;
            return (
              <line
                key={i}
                x1={CHART_PADDING.left}
                y1={y}
                x2={width - CHART_PADDING.right}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : '4,4'}
              />
            );
          })}
        </g>
      )}

      {/* Y-axis labels */}
      <g className="text-text-tertiary text-xs">
        {yTicks.map((tick, i) => {
          const y = CHART_PADDING.top + chartHeight - ((tick - minValue) / (maxValue - minValue)) * chartHeight;
          return (
            <text key={i} x={CHART_PADDING.left - 8} y={y + 4} textAnchor="end" fill="currentColor">
              {formatValue(tick)}
            </text>
          );
        })}
      </g>

      {/* Areas */}
      {dataSeries.map((s, idx) => {
        const points = s.data.map((d, i) => ({
          x: CHART_PADDING.left + i * xStep,
          y: CHART_PADDING.top + chartHeight - ((d.value - minValue) / (maxValue - minValue)) * chartHeight,
        }));

        const linePath = generateLinePath(points);
        const areaPath = linePath + ` L ${points[points.length - 1].x} ${CHART_PADDING.top + chartHeight} L ${points[0].x} ${CHART_PADDING.top + chartHeight} Z`;

        return (
          <g key={s.id}>
            <path d={areaPath} fill={`url(#${chartId}-area-gradient-${idx})`} />
            <path
              d={linePath}
              fill="none"
              stroke={s.color || colors[idx]}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* X-axis labels */}
      <g className="text-text-tertiary text-xs">
        {dataSeries[0]?.data.map((d, i) => {
          const showLabel = pointCount <= 10 || i % Math.ceil(pointCount / 8) === 0;
          if (!showLabel) return null;

          const x = CHART_PADDING.left + i * xStep;
          return (
            <text key={i} x={x} y={height - 8} textAnchor="middle" fill="currentColor">
              {formatLabel(d.label)}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legend Component
// ---------------------------------------------------------------------------

interface LegendProps {
  items: Array<{ id: string; name: string; color: string }>;
}

function Legend({ items }: LegendProps) {
  return (
    <div className="flex flex-wrap gap-4 mt-4 justify-center">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-xs text-text-secondary">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AnalyticsChart({
  title,
  subtitle,
  type,
  data = [],
  series,
  height = 300,
  showGrid = true,
  showLegend = true,
  showTooltips = true,
  showLabels = false,
  isLoading = false,
  isError = false,
  errorMessage = 'Failed to load chart data',
  trend,
  trendLabel = 'vs last period',
  className,
  formatValue = formatCompactNumber,
  formatLabel = (label) => label,
  colors = DEFAULT_COLORS,
  emptyMessage = 'No data available',
  xAxisLabel,
  yAxisLabel,
}: AnalyticsChartProps) {
  // Memoize chart dimensions
  const [containerRef, setContainerRef] = React.useState<HTMLDivElement | null>(null);
  const width = containerRef?.clientWidth || 600;

  // Get chart icon
  const ChartIcon = getChartIcon(type);

  // Determine if data is empty
  const hasData = series ? series.some((s) => s.data.length > 0) : data.length > 0;

  // Get trend indicator
  const trendConfig = useMemo(() => {
    if (trend === undefined) return null;
    if (trend === 0) return { icon: Minus, color: 'text-zinc-500' };
    if (trend > 0) return { icon: TrendingUp, color: 'text-green-500' };
    return { icon: TrendingDown, color: 'text-red-500' };
  }, [trend]);

  // Prepare legend items
  const legendItems = useMemo(() => {
    if (!showLegend) return [];
    if (series) {
      return series.map((s, i) => ({
        id: s.id,
        name: s.name,
        color: s.color || colors[i % colors.length],
      }));
    }
    if (type === 'pie' || type === 'donut') {
      return data.map((d, i) => ({
        id: d.label,
        name: d.label,
        color: d.color || colors[i % colors.length],
      }));
    }
    return [];
  }, [series, data, colors, showLegend, type]);

  // Handle loading state
  if (isLoading) {
    return (
      <Card variant="elevated" className={cn('p-5', className)}>
        <ChartSkeleton height={height} />
      </Card>
    );
  }

  // Render chart content
  const renderChart = () => {
    if (isError) {
      return <ErrorState message={errorMessage} />;
    }

    if (!hasData) {
      return <EmptyState message={emptyMessage} type={type} />;
    }

    switch (type) {
      case 'line':
        return (
          <LineChartRenderer
            data={data}
            series={series}
            width={width}
            height={height}
            colors={colors}
            showGrid={showGrid}
            showLabels={showLabels}
            formatValue={formatValue}
            formatLabel={formatLabel}
          />
        );
      case 'bar':
        return (
          <BarChartRenderer
            data={data}
            series={series}
            width={width}
            height={height}
            colors={colors}
            showGrid={showGrid}
            showLabels={showLabels}
            formatValue={formatValue}
            formatLabel={formatLabel}
          />
        );
      case 'pie':
      case 'donut':
        return (
          <PieChartRenderer
            data={data}
            width={width}
            height={height}
            colors={colors}
            isDonut={type === 'donut'}
            showLabels={showLabels}
            formatValue={formatValue}
          />
        );
      case 'area':
        return (
          <AreaChartRenderer
            data={data}
            series={series}
            width={width}
            height={height}
            colors={colors}
            showGrid={showGrid}
            formatValue={formatValue}
            formatLabel={formatLabel}
          />
        );
      default:
        return <EmptyState message="Unsupported chart type" type={type} />;
    }
  };

  return (
    <Card variant="elevated" className={cn('p-5', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 shrink-0">
          <ChartIcon className="w-5 h-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-secondary truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-text-tertiary truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {trendConfig && (
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              trend! > 0 ? 'bg-green-500/10' : trend! < 0 ? 'bg-red-500/10' : 'bg-zinc-500/10',
              trendConfig.color
            )}
          >
            <trendConfig.icon className="w-3 h-3" />
            <span className="tabular-nums">{Math.abs(trend!).toFixed(1)}%</span>
            <span className="text-text-tertiary hidden sm:inline">{trendLabel}</span>
          </div>
        )}
      </div>

      {/* Axis labels */}
      {(xAxisLabel || yAxisLabel) && (
        <div className="flex justify-between text-xs text-text-tertiary mb-2">
          {yAxisLabel && <span>{yAxisLabel}</span>}
          {xAxisLabel && <span>{xAxisLabel}</span>}
        </div>
      )}

      {/* Chart container */}
      <div
        ref={setContainerRef}
        className="w-full"
        style={{ height }}
      >
        {containerRef && renderChart()}
      </div>

      {/* Legend */}
      {showLegend && legendItems.length > 0 && <Legend items={legendItems} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Convenience Components for Common Chart Types
// ---------------------------------------------------------------------------

export interface ViewsOverTimeChartProps {
  data: Array<{ date: string; views: number; uniqueVisitors?: number }>;
  isLoading?: boolean;
  isError?: boolean;
  trend?: number;
  className?: string;
  height?: number;
}

/**
 * Pre-configured line chart for views over time
 */
export function ViewsOverTimeChart({
  data,
  isLoading,
  isError,
  trend,
  className,
  height = 300,
}: ViewsOverTimeChartProps) {
  const chartData: DataPoint[] = data.map((d) => ({
    label: d.date,
    value: d.views,
  }));

  const series: ChartSeries[] | undefined = data.some((d) => d.uniqueVisitors !== undefined)
    ? [
        {
          id: 'views',
          name: 'Total Views',
          data: data.map((d) => ({ label: d.date, value: d.views })),
          color: '#3B82F6',
        },
        {
          id: 'visitors',
          name: 'Unique Visitors',
          data: data.map((d) => ({ label: d.date, value: d.uniqueVisitors ?? 0 })),
          color: '#22C55E',
        },
      ]
    : undefined;

  return (
    <AnalyticsChart
      type="line"
      title="Views Over Time"
      subtitle="Daily gallery and asset views"
      data={series ? [] : chartData}
      series={series}
      isLoading={isLoading}
      isError={isError}
      trend={trend}
      className={className}
      height={height}
      formatLabel={(label) => {
        // Format date labels
        try {
          const date = new Date(label);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
          return label;
        }
      }}
    />
  );
}

export interface DeviceBreakdownChartProps {
  desktop: number;
  tablet: number;
  mobile: number;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
  height?: number;
}

/**
 * Pre-configured donut chart for device breakdown
 */
export function DeviceBreakdownChart({
  desktop,
  tablet,
  mobile,
  isLoading,
  isError,
  className,
  height = 250,
}: DeviceBreakdownChartProps) {
  const data: DataPoint[] = [
    { label: 'Desktop', value: desktop, color: '#3B82F6' },
    { label: 'Tablet', value: tablet, color: '#A855F7' },
    { label: 'Mobile', value: mobile, color: '#22C55E' },
  ].filter((d) => d.value > 0);

  return (
    <AnalyticsChart
      type="donut"
      title="Device Breakdown"
      subtitle="Views by device type"
      data={data}
      isLoading={isLoading}
      isError={isError}
      className={className}
      height={height}
      showLabels
    />
  );
}

export interface GeographicBreakdownChartProps {
  data: Array<{ countryCode: string; countryName?: string; count: number }>;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
  height?: number;
  limit?: number;
}

/**
 * Pre-configured bar chart for geographic breakdown
 */
export function GeographicBreakdownChart({
  data,
  isLoading,
  isError,
  className,
  height = 250,
  limit = 8,
}: GeographicBreakdownChartProps) {
  const chartData: DataPoint[] = data
    .slice(0, limit)
    .map((d) => ({
      label: d.countryName || d.countryCode,
      value: d.count,
    }));

  return (
    <AnalyticsChart
      type="bar"
      title="Geographic Distribution"
      subtitle="Top countries by views"
      data={chartData}
      isLoading={isLoading}
      isError={isError}
      className={className}
      height={height}
      showLabels
      showLegend={false}
    />
  );
}

export interface EngagementBreakdownChartProps {
  favorites: number;
  comments: number;
  selections: number;
  downloads: number;
  shares?: number;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
  height?: number;
}

/**
 * Pre-configured bar chart for engagement breakdown
 */
export function EngagementBreakdownChart({
  favorites,
  comments,
  selections,
  downloads,
  shares = 0,
  isLoading,
  isError,
  className,
  height = 250,
}: EngagementBreakdownChartProps) {
  const data: DataPoint[] = [
    { label: 'Favorites', value: favorites, color: '#EC4899' },
    { label: 'Comments', value: comments, color: '#3B82F6' },
    { label: 'Selections', value: selections, color: '#22C55E' },
    { label: 'Downloads', value: downloads, color: '#F97316' },
    ...(shares > 0 ? [{ label: 'Shares', value: shares, color: '#A855F7' }] : []),
  ];

  return (
    <AnalyticsChart
      type="bar"
      title="Engagement Breakdown"
      subtitle="User interactions by type"
      data={data}
      isLoading={isLoading}
      isError={isError}
      className={className}
      height={height}
      showLabels
      showLegend={false}
    />
  );
}

export interface TrafficSourceChartProps {
  direct: number;
  shareLink: number;
  referral: number;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
  height?: number;
}

/**
 * Pre-configured pie chart for traffic source breakdown
 */
export function TrafficSourceChart({
  direct,
  shareLink,
  referral,
  isLoading,
  isError,
  className,
  height = 250,
}: TrafficSourceChartProps) {
  const data: DataPoint[] = [
    { label: 'Direct', value: direct, color: '#3B82F6' },
    { label: 'Share Link', value: shareLink, color: '#22C55E' },
    { label: 'Referral', value: referral, color: '#F97316' },
  ].filter((d) => d.value > 0);

  return (
    <AnalyticsChart
      type="pie"
      title="Traffic Sources"
      subtitle="How visitors find your galleries"
      data={data}
      isLoading={isLoading}
      isError={isError}
      className={className}
      height={height}
    />
  );
}

// ---------------------------------------------------------------------------
// Charts Grid Component
// ---------------------------------------------------------------------------

export interface ChartsGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

/**
 * Grid layout component for multiple charts
 */
export function ChartsGrid({ children, columns = 2, className }: ChartsGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[columns];

  return <div className={cn('grid gap-6', gridCols, className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default AnalyticsChart;
