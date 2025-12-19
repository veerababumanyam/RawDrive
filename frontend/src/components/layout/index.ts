/* =============================================================================
   Layout Components - Central Export
   ============================================================================= */

export {
  AppShell,
  Shell,
  AppShellHeader,
  AppShellSidebar,
  AppShellMain,
  AppShellFooter,
  AppShellContent,
  useAppShell,
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
} from './AppShell';
export type {
  AppShellProps,
  AppShellHeaderProps,
  AppShellSidebarProps,
  AppShellMainProps,
  AppShellFooterProps,
  AppShellContentProps,
} from './AppShell';

export {
  Sidebar,
  Nav,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarSection,
  SidebarItem,
  SidebarDivider,
  useSidebar,
} from './Sidebar';
export type {
  SidebarProps,
  SidebarHeaderProps,
  SidebarContentProps,
  SidebarFooterProps,
  SidebarSectionProps,
  SidebarItemProps,
} from './Sidebar';

export { WorkspaceLayout } from './WorkspaceLayout';
