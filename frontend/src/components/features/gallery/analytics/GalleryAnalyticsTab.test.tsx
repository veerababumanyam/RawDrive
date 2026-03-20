/**
 * GalleryAnalyticsTab Tests
 *
 * Tests for the gallery analytics dashboard tab component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock recharts to avoid canvas/SVG rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  Legend: () => <div data-testid="legend" />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
}));

// Mock the analytics hook
const mockAnalyticsData = {
  gallery_id: 'test-gallery-id',
  summary: {
    total_views: 1250,
    unique_visitors: 842,
    avg_time_spent_seconds: 185,
    views_today: 45,
    views_this_week: 312,
    views_this_month: 890,
  },
  daily_stats: [
    { date: '2026-03-15', views: 120, unique_visitors: 80 },
    { date: '2026-03-16', views: 150, unique_visitors: 95 },
    { date: '2026-03-17', views: 180, unique_visitors: 110 },
  ],
  device_breakdown: {
    desktop_count: 500,
    mobile_count: 300,
    tablet_count: 42,
    desktop_pct: 59.4,
    mobile_pct: 35.6,
    tablet_pct: 5.0,
  },
  geo_breakdown: [
    { country_code: 'US', country_name: 'United States', count: 350 },
    { country_code: 'IN', country_name: 'India', count: 200 },
    { country_code: 'GB', country_name: 'United Kingdom', count: 100 },
  ],
  download_summary: {
    total_downloads: 85,
    total_bytes: 2147483648,
  },
  period_start: '2026-02-18',
  period_end: '2026-03-20',
};

const mockUseGalleryAnalyticsTab = vi.fn();

vi.mock('../../../../hooks/useGalleryAnalyticsTab', () => ({
  useGalleryAnalyticsTab: (...args: unknown[]) => mockUseGalleryAnalyticsTab(...args),
}));

import { GalleryAnalyticsTab } from './GalleryAnalyticsTab';

describe('GalleryAnalyticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGalleryAnalyticsTab.mockReturnValue({
      data: mockAnalyticsData,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('renders summary cards with correct values', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('842')).toBeInTheDocument();
    expect(screen.getByText('3m 5s')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('renders all chart sections', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByText('Views Over Time')).toBeInTheDocument();
    expect(screen.getByText('Device Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Top Countries')).toBeInTheDocument();
    expect(screen.getByText('Downloads')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    mockUseGalleryAnalyticsTab.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(
      screen.getByText(/no analytics data yet/i)
    ).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockUseGalleryAnalyticsTab.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    });

    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    const skeletons = screen.getAllByTestId('analytics-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders period selector with all options', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByRole('button', { name: /7d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /30d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /90d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
  });

  it('changes period on button click', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    fireEvent.click(screen.getByRole('button', { name: /7d/i }));

    expect(mockUseGalleryAnalyticsTab).toHaveBeenCalledWith(
      expect.objectContaining({ period: '7d' })
    );
  });

  it('shows download stats with formatted values', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByText('85')).toBeInTheDocument();
    // 2GB formatted
    expect(screen.getByText('2.0 GB')).toBeInTheDocument();
  });

  it('shows device percentages', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByText(/59\.4%/)).toBeInTheDocument();
    expect(screen.getByText(/35\.6%/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0%/)).toBeInTheDocument();
  });

  it('shows geo breakdown countries', () => {
    render(<GalleryAnalyticsTab galleryId="test-gallery-id" />);

    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
  });
});
