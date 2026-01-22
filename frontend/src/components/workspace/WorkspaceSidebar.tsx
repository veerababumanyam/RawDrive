import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Users,
  UsersRound,
  Eye,
  Share2,
  HelpCircle,
  Crown,
  LayoutGrid,
  Clock,
  Star,
  Trash2,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  UserCircle,
  User,
  Mail,
  Cpu,
  Sparkles,
  TrendingUp,
  BarChart2,
  Building2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarSection,
  SidebarItem,
  SidebarDivider,
} from '../layout/Sidebar';
import { useAppShell } from '../layout/AppShell';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../ui/AppButton';

/* =============================================================================
   WorkspaceSidebar Component
   ============================================================================= */

interface WorkspaceSidebarProps {
  /** Current workspace name */
  workspaceName?: string;
  /** Current user's plan */
  plan?: 'free' | 'pro' | 'enterprise';
  /** Storage used in bytes */
  storageUsed?: number;
  /** Storage limit in bytes */
  storageLimit?: number;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  workspaceName = 'My Workspace',
  plan = 'free',
  storageUsed = 0,
  storageLimit = 5 * 1024 * 1024 * 1024, // 5GB free tier
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { sidebarCollapsed, toggleCollapse } = useAppShell();
  const { logout } = useAuth();

  const currentPath = location.pathname;

  // Calculate storage percentage
  const storagePercent = Math.min((storageUsed / storageLimit) * 100, 100);

  const formatStorage = React.useCallback((bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }, []);

  const mainNavItems = React.useMemo(() => [
    // { id: 'dashboard', label: t('nav.dashboard'), icon: <Home size={20} />, path: '/workspace' },
    { id: 'galleries', label: t('nav.galleries'), icon: <LayoutGrid size={20} />, path: '/workspace/galleries' },
    { id: 'invitations', label: t('nav.invitations', 'Invitations'), icon: <Mail size={20} />, path: '/workspace/invitations' },
    // Terminology Note: "People" feature is now referred to as "FaceIDs" in the UI to avoid user confusion
    { id: 'people', label: t('nav.people', 'FaceIDs'), icon: <UserCircle size={20} />, path: '/workspace/people' },
    { id: 'clients', label: t('nav.clients'), icon: <Users size={20} />, path: '/workspace/clients' },
    { id: 'visitors', label: t('nav.visitors'), icon: <Eye size={20} />, path: '/workspace/visitors' },
    { id: 'shared', label: t('nav.shared'), icon: <Share2 size={20} />, path: '/workspace/shared' },
  ], [t]);

  const quickAccessItems = React.useMemo(() => [
    { id: 'recent', label: t('nav.recent'), icon: <Clock size={20} />, path: '/workspace/recent' },
    { id: 'favorites', label: t('nav.favorites'), icon: <Star size={20} />, path: '/workspace/favorites' },
    { id: 'trash', label: t('nav.trash'), icon: <Trash2 size={20} />, path: '/workspace/trash' },
  ], [t]);

  const bottomNavItems = React.useMemo(() => [
    { id: 'companyProfile', label: t('nav.companyProfile', 'Company Profile'), icon: <Building2 size={20} />, path: '/workspace/settings?tab=profile' },
    { id: 'myProfile', label: t('nav.myProfile', 'My Profile'), icon: <User size={20} />, path: '/settings' },
    { id: 'team', label: t('nav.team', 'Team'), icon: <UsersRound size={20} />, path: '/workspace/team' },
    { id: 'help', label: t('nav.helpSupport', 'Help & Support'), icon: <HelpCircle size={20} />, path: '/workspace/help' },
  ], [t]);

  // AI & Analytics navigation items
  const aiNavItems = React.useMemo(() => [
    { id: 'analytics', label: t('nav.analytics', 'Analytics'), icon: <BarChart2 size={20} />, path: '/workspace/analytics' },
    { id: 'ai-insights', label: t('nav.aiInsights', 'AI Insights'), icon: <TrendingUp size={20} />, path: '/workspace/ai/insights' },
    { id: 'ai-tools', label: t('nav.aiTools', 'AI Tools'), icon: <Cpu size={20} />, path: '/workspace/ai/tools' },
  ], [t]);

  // Helper to check if a path is active using segment-based matching
  // This prevents false positives like /workspace/galleries-archive matching /workspace/galleries
  const isPathActive = React.useCallback((itemPath: string, current: string): boolean => {
    if (itemPath === '/workspace') {
      return current === '/workspace';
    }
    // Check if current path starts with itemPath followed by end, /, or ?
    return current === itemPath ||
      current.startsWith(itemPath + '/') ||
      current.startsWith(itemPath + '?');
  }, []);

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/signin');
    } catch {
      navigate('/signin');
    }
  };

  return (
    <Sidebar collapsed={sidebarCollapsed} activeItem={currentPath} className="h-full">
      {/* Sidebar Header with Dashboard Link and Collapse Toggle */}
      <SidebarHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/40">
        <div className={`flex items-center w-full ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && (
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => handleNavigation('/workspace')}
              role="button"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-200">
                <LayoutGrid size={20} className="transform group-hover:scale-110 transition-transform duration-200" />
              </div>
              <span className="font-bold text-lg text-text-primary tracking-tight group-hover:text-primary transition-colors duration-200">
                {t('nav.dashboard', 'Dashboard')}
              </span>
            </div>
          )}

          <button
            onClick={toggleCollapse}
            className={`
              p-2 rounded-lg 
              hover:bg-surface-hover hover:text-primary 
              text-text-tertiary transition-all duration-200 
              ${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : ''}
            `}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
      </SidebarHeader>

      {/* Main Navigation */}
      <SidebarContent className="pt-2">


        {/* Main Nav */}
        <SidebarSection title={sidebarCollapsed ? undefined : 'Main'}>
          {mainNavItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.path}
              label={item.label}
              icon={item.icon}
              active={isPathActive(item.path, currentPath)}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </SidebarSection>

        <SidebarDivider />

        {/* Quick Access */}
        <SidebarSection title={sidebarCollapsed ? undefined : 'Quick Access'}>
          {quickAccessItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.path}
              label={item.label}
              icon={item.icon}
              active={isPathActive(item.path, currentPath)}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </SidebarSection>

        <SidebarDivider />

        {/* AI & Analytics Section */}
        <SidebarSection title={sidebarCollapsed ? undefined : 'AI & Analytics'}>
          {aiNavItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.path}
              label={item.label}
              icon={item.icon}
              active={isPathActive(item.path, currentPath)}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </SidebarSection>

        <SidebarDivider />

        {/* System Section */}
        <SidebarSection title={sidebarCollapsed ? undefined : 'System'}>
          {bottomNavItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.path}
              label={item.label}
              icon={item.icon}
              active={isPathActive(item.path, currentPath)}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </SidebarSection>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        {/* Storage Usage - Glassmorphism style */}
        {!sidebarCollapsed && (
          <div className="mb-4 p-3 rounded-xl bg-surface-hover/50 backdrop-blur-sm border border-border/30">
            <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
              <span className="font-semibold">{t('storage.title')}</span>
              <span className="font-medium">
                {formatStorage(storageUsed)} / {formatStorage(storageLimit)}
              </span>
            </div>
            <div className="sidebar-storage-bar">
              <div
                className={`sidebar-storage-fill ${storagePercent > 90 ? 'danger' : storagePercent > 70 ? 'warning' : ''
                  }`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            {plan === 'free' && (
              <AppButton
                variant="gold"
                size="sm"
                onClick={() => navigate('/workspace/settings?tab=subscription')}
                fullWidth
                leftIcon={<Crown size={14} />}
                className="mt-3"
                shine
              >
                {t('storage.upgrade')}
              </AppButton>
            )}
          </div>
        )}

        {/* Logout Button */}
        <AppButton
          variant="ghost"
          size={sidebarCollapsed ? 'icon' : 'md'}
          onClick={handleLogout}
          fullWidth
          leftIcon={<LogOut size={20} />}
          title={sidebarCollapsed ? t('user.logout') : undefined}
          className="hover:!text-error hover:!bg-error/5"
        >
          {!sidebarCollapsed && t('user.logout')}
        </AppButton>
      </SidebarFooter>
    </Sidebar>
  );
};

export default WorkspaceSidebar;
