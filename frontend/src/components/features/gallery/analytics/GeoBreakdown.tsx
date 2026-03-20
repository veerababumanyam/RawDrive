/**
 * GeoBreakdown Component
 *
 * Horizontal bar chart showing top countries by view count.
 */

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { GeoEntry } from '../../../../hooks/useGalleryAnalyticsTab';

interface GeoBreakdownProps {
  data: GeoEntry[];
}

export const GeoBreakdownChart: React.FC<GeoBreakdownProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">
        No geographic data available
      </div>
    );
  }

  // Show top 10 countries
  const chartData = data.slice(0, 10).map((entry) => ({
    country: entry.country_name,
    views: entry.count,
    code: entry.country_code,
  }));

  return (
    <div className="space-y-4">
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border-secondary" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} className="text-text-tertiary" />
            <YAxis
              type="category"
              dataKey="country"
              tick={{ fontSize: 12 }}
              className="text-text-tertiary"
              width={80}
            />
            <Tooltip
              formatter={(value: number) => [`${value} views`, 'Views']}
              contentStyle={{
                backgroundColor: 'var(--color-surface-primary, #fff)',
                border: '1px solid var(--color-border-primary, #e5e7eb)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="views" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {chartData.map(({ country, views, code }) => (
          <div key={code} className="flex items-center justify-between text-sm">
            <span className="text-text-primary">{country}</span>
            <span className="text-text-tertiary">{views.toLocaleString()} views</span>
          </div>
        ))}
      </div>
    </div>
  );
};
