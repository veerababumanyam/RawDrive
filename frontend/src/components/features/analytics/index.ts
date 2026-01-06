/**
 * Analytics Components
 *
 * Feature components for the Analytics & Reporting system.
 */

// Overview Card
export {
  AnalyticsOverviewCard,
  ViewsCard,
  DownloadsCard,
  NewClientsCard,
  RevenueCard,
  GalleriesCard,
  ActiveClientsCard,
  StorageCard,
  StatsGrid,
  type AnalyticsOverviewCardProps,
  type QuickStatCardProps,
  type StatsGridProps,
  type MetricType,
} from './AnalyticsOverviewCard';

// Chart Components
export {
  AnalyticsChart,
  ViewsOverTimeChart,
  DeviceBreakdownChart,
  GeographicBreakdownChart,
  EngagementBreakdownChart,
  TrafficSourceChart,
  ChartsGrid,
  type AnalyticsChartProps,
  type ChartType,
  type DataPoint,
  type ChartSeries,
  type ViewsOverTimeChartProps,
  type DeviceBreakdownChartProps,
  type GeographicBreakdownChartProps,
  type EngagementBreakdownChartProps,
  type TrafficSourceChartProps,
  type ChartsGridProps,
} from './AnalyticsChart';

// Gallery Analytics Panel
export {
  GalleryAnalyticsPanel,
  GalleryAnalyticsSummaryCard,
  type GalleryAnalyticsPanelProps,
  type GalleryAnalyticsSummaryCardProps,
  type GalleryAnalyticsPanelTab,
  type DateRange,
} from './GalleryAnalyticsPanel';

// Client Analytics Table
export {
  ClientAnalyticsTable,
  TopClientsTable,
  ChurnRiskTable,
  type ClientAnalyticsTableProps,
  type TopClientsTableProps,
  type ChurnRiskTableProps,
  type ClientTableRow,
  type SortableColumn,
  type ClientFilterType,
} from './ClientAnalyticsTable';

// Report Builder
export {
  ReportBuilder,
  QuickReportBuilder,
  type ReportBuilderProps,
  type QuickReportBuilderProps,
  type ReportBuilderTab,
} from './ReportBuilder';
