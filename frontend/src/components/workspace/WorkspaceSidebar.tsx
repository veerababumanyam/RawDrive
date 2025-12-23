import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  FolderOpen,
  Users,
  Share2,
  Settings,
  HelpCircle,
  Crown,
  LayoutGrid,
  Clock,
  Star,
  Trash2,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Building2,
} from 'lucide-react';
import {
  Sidebar,
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

   Main navigation sidebar for the workspace application.

   IMPORTANT: Sidebar includes its own header with logo and collapse toggle.
   This follows standard practice where the sidebar is self-contained.
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
    { id: 'dashboard', label: t('nav.dashboard'), icon: <Home size={20} />, path: '/workspace' },
    { id: 'galleries', label: t('nav.galleries'), icon: <LayoutGrid size={20} />, path: '/workspace/galleries' },
    { id: 'libraries', label: t('nav.libraries'), icon: <FolderOpen size={20} />, path: '/workspace/libraries' },
    { id: 'clients', label: t('nav.clients'), icon: <Users size={20} />, path: '/workspace/clients' },
    { id: 'visitors', label: t('nav.visitors'), icon: <Users size={20} />, path: '/workspace/visitors' },
    { id: 'shared', label: t('nav.shared'), icon: <Share2 size={20} />, path: '/workspace/shared' },
  ], [t]);

  const quickAccessItems = React.useMemo(() => [
    { id: 'recent', label: t('nav.recent'), icon: <Clock size={20} />, path: '/workspace/recent' },
    { id: 'favorites', label: t('nav.favorites'), icon: <Star size={20} />, path: '/workspace/favorites' },
    { id: 'trash', label: t('nav.trash'), icon: <Trash2 size={20} />, path: '/workspace/trash' },
  ], [t]);

  const bottomNavItems = React.useMemo(() => [
    { id: 'settings', label: t('nav.settings'), icon: <Settings size={20} />, path: '/workspace/settings' },
    { id: 'profile', label: t('nav.companyProfile'), icon: <Building2 size={20} />, path: '/workspace/settings/profile' },
    { id: 'help', label: t('nav.help'), icon: <HelpCircle size={20} />, path: '/workspace/help' },
  ], [t]);

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
      {/* Main Navigation */}
      <SidebarContent className="pt-2">
        {/* Collapse Toggle & Workspace Info */}
        <div className={`px-3 mb-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {/* Collapse Toggle Button */}
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} mb-3`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3 p-2 rounded-xl bg-surface-hover/50 flex-1 mr-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white font-bold text-sm">
                    {workspaceName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary truncate text-sm">
                    {workspaceName}
                  </div>
                  <div className="text-xs text-text-tertiary flex items-center gap-1">
                    {plan !== 'free' && <Crown size={12} className="text-gold" />}
                    {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            </button>
          </div>
        </div>

        {/* Main Nav */}
        <SidebarSection title={sidebarCollapsed ? undefined : 'Main'}>
          {mainNavItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.path}
              label={item.label}
              icon={item.icon}
              active={
                item.path === '/workspace'
                  ? currentPath === '/workspace'
                  : currentPath.startsWith(item.path)
              }
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
              active={currentPath.startsWith(item.path)}
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
              active={currentPath.startsWith(item.path)}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </SidebarSection>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        {/* Storage Usage */}
        {!sidebarCollapsed && (
          <div className="mb-4 p-3 rounded-xl bg-surface-hover/50">
            <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
              <span className="font-medium">{t('storage.title')}</span>
              <span>
                {formatStorage(storageUsed)} / {formatStorage(storageLimit)}
              </span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${storagePercent > 90
                  ? 'bg-error'
                  : storagePercent > 70
                    ? 'bg-warning'
                    : 'bg-gradient-to-r from-primary to-accent'
                  }`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            {plan === 'free' && (
              <AppButton
                variant="gold"
                size="sm"
                onClick={() => navigate('/workspace/settings/billing')}
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
