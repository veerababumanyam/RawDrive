/**
 * ViewsChart Component
 *
 * Time series area chart showing views and unique visitors over time.
 * Uses recharts for rendering.
 */

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { GalleryAnalyticsTimeSeries } from '../../../../hooks/useGalleryAnalyticsTab';

interface ViewsChartProps {
  data: GalleryAnalyticsTimeSeries[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ViewsChart: React.FC<ViewsChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">
        No view data for this period
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDate(d.date),
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="visitorsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border-secondary" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="text-text-tertiary"
          />
          <YAxis tick={{ fontSize: 12 }} className="text-text-tertiary" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface-primary, #fff)',
              border: '1px solid var(--color-border-primary, #e5e7eb)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke="#6366f1"
            fill="url(#viewsGradient)"
            strokeWidth={2}
            name="Views"
          />
          <Area
            type="monotone"
            dataKey="unique_visitors"
            stroke="#06b6d4"
            fill="url(#visitorsGradient)"
            strokeWidth={2}
            name="Unique Visitors"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
