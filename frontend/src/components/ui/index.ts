/* =============================================================================
   RawDrive UI Component Library - Central Export

   This file exports all UI components from the design system.
   Import components from '@/components/ui' for clean imports.
   ============================================================================= */

// Core Components
export { AppButton, ButtonGroup } from './AppButton';
export type { AppButtonProps, ButtonVariant, ButtonSize } from './AppButton';

export { AppInput, AppTextarea } from './AppInput';
export type { AppInputProps, AppTextareaProps, InputSize, InputVariant } from './AppInput';

export {
  AppCard,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
  CardImage,
} from './AppCard';
export type { AppCardProps, CardVariant } from './AppCard';

export { AppBadge, BadgeGroup, StatusBadge, CountBadge } from './AppBadge';
export type { AppBadgeProps, BadgeVariant, BadgeSize, BadgeGroupProps, StatusBadgeProps, CountBadgeProps } from './AppBadge';

// Layout Components
export {
  Modal,
  Dialog,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ConfirmDialog,
} from './Modal';
export type { ModalProps, ModalSize, ConfirmDialogProps } from './Modal';

// Form Controls
export {
  Checkbox,
  Radio,
  RadioGroup,
  Toggle,
  Select,
  RangeSlider,
} from './FormControls';
export type {
  CheckboxProps,
  RadioProps,
  RadioGroupProps,
  ToggleProps,
  SelectProps,
  SelectOption,
  RangeSliderProps,
} from './FormControls';

// Feedback Components
export { ToastProvider, useToast, useToastActions } from './Toast';
export type { ToastData, ToastVariant, ToastPosition, ToastProviderProps } from './Toast';

export {
  Progress,
  CircularProgress,
  Spinner,
  Skeleton,
  SkeletonGroup,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonListItem,
} from './Progress';
export type {
  ProgressProps,
  ProgressVariant,
  ProgressSize,
  CircularProgressProps,
  SpinnerProps,
  SpinnerSize,
  SkeletonProps,
  SkeletonGroupProps,
  SkeletonCardProps,
} from './Progress';

// Data Display Components
export { DataTable, TablePagination } from './DataTable';
export type {
  DataTableProps,
  Column,
  SortDirection,
  TablePaginationProps,
} from './DataTable';

// Navigation Components
export {
  Tabs,
  TabsNav,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Breadcrumb,
  Pagination,
} from './Navigation';
export type {
  TabsProps,
  TabListProps,
  TabProps,
  TabPanelsProps,
  TabPanelProps,
  BreadcrumbProps,
  BreadcrumbItem,
  PaginationProps,
} from './Navigation';

// Media Components
export { PhotoGrid, MasonryGrid } from './PhotoGrid';
export type { PhotoGridProps, Photo, MasonryGridProps } from './PhotoGrid';

export { FileUploader, DropZone } from './FileUploader';
export type { FileUploaderProps, UploadFile, DropZoneProps } from './FileUploader';

// Accessibility Components
export { SkipLink } from './SkipLink';
export { VisuallyHidden } from './VisuallyHidden';
