/**
 * DeviceBreakdown Component
 *
 * Pie chart showing desktop/mobile/tablet device percentages.
 */

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
} from 'recharts';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import type { DeviceBreakdown as DeviceBreakdownType } from '../../../../hooks/useGalleryAnalyticsTab';

interface DeviceBreakdownProps {
  data: DeviceBreakdownType;
}

const COLORS = ['#6366f1', '#06b6d4', '#f59e0b'];

const DEVICE_ICONS = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
};

export const DeviceBreakdownChart: React.FC<DeviceBreakdownProps> = ({ data }) => {
  const total = data.desktop_count + data.mobile_count + data.tablet_count;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">
        No device data available
      </div>
    );
  }

  const chartData = [
    { name: 'Desktop', value: data.desktop_count, pct: data.desktop_pct },
    { name: 'Mobile', value: data.mobile_count, pct: data.mobile_pct },
    { name: 'Tablet', value: data.tablet_count, pct: data.tablet_pct },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} views`,
                name,
              ]}
              contentStyle={{
                backgroundColor: 'var(--color-surface-primary, #fff)',
                border: '1px solid var(--color-border-primary, #e5e7eb)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {[
          { label: 'Desktop', pct: data.desktop_pct, count: data.desktop_count, color: COLORS[0] },
          { label: 'Mobile', pct: data.mobile_pct, count: data.mobile_count, color: COLORS[1] },
          { label: 'Tablet', pct: data.tablet_pct, count: data.tablet_count, color: COLORS[2] },
        ].map(({ label, pct, count, color }) => {
          const Icon = DEVICE_ICONS[label as keyof typeof DEVICE_ICONS];
          return (
            <div key={label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: color }}
                />
                <Icon size={14} className="text-text-secondary" />
                <span className="text-text-primary">{label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-tertiary">{count}</span>
                <span className="text-text-primary font-medium">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
