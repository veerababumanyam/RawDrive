import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  FolderOpen,
  Users,
  Share2,
  Settings,
  HelpCircle,
  Crown,
  Plus,
  LayoutGrid,
  Clock,
  Star,
  Trash2,
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

/* =============================================================================
   WorkspaceSidebar Component

   Main navigation sidebar for the workspace application.
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
  const { sidebarCollapsed } = useAppShell();

  const currentPath = location.pathname;

  // Calculate storage percentage
  const storagePercent = Math.min((storageUsed / storageLimit) * 100, 100);
  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} />, path: '/workspace' },
    { id: 'galleries', label: 'Galleries', icon: <LayoutGrid size={20} />, path: '/workspace/galleries' },
    { id: 'libraries', label: 'Libraries', icon: <FolderOpen size={20} />, path: '/workspace/libraries' },
    { id: 'clients', label: 'Clients', icon: <Users size={20} />, path: '/workspace/clients' },
    { id: 'shared', label: 'Shared', icon: <Share2 size={20} />, path: '/workspace/shared' },
  ];

  const quickAccessItems = [
    { id: 'recent', label: 'Recent', icon: <Clock size={20} />, path: '/workspace/recent' },
    { id: 'favorites', label: 'Favorites', icon: <Star size={20} />, path: '/workspace/favorites' },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={20} />, path: '/workspace/trash' },
  ];

  const bottomNavItems = [
    { id: 'settings', label: 'Settings', icon: <Settings size={20} />, path: '/workspace/settings' },
    { id: 'help', label: 'Help & Support', icon: <HelpCircle size={20} />, path: '/workspace/help' },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <Sidebar collapsed={sidebarCollapsed} activeItem={currentPath}>
      {/* Header with Logo/Workspace */}
      <SidebarHeader>
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-text-primary truncate">
                {workspaceName}
              </div>
              <div className="text-xs text-text-tertiary flex items-center gap-1">
                {plan !== 'free' && <Crown size={12} className="text-gold" />}
                {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
              </div>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
        )}
      </SidebarHeader>

      {/* Main Navigation */}
      <SidebarContent>
        {/* New Gallery Button */}
        <div className="px-2 mb-4">
          <button
            onClick={() => navigate('/workspace/galleries/new')}
            className={`
              w-full flex items-center justify-center gap-2
              px-4 py-2.5
              bg-primary hover:bg-primary-hover
              text-white font-medium
              rounded-lg
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
              min-h-[44px]
              ${sidebarCollapsed ? 'px-2' : ''}
            `}
          >
            <Plus size={20} />
            {!sidebarCollapsed && <span>New Gallery</span>}
          </button>
        </div>

        {/* Main Nav */}
        <SidebarSection>
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
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        {/* Storage Usage */}
        {!sidebarCollapsed && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
              <span>Storage</span>
              <span>
                {formatStorage(storageUsed)} / {formatStorage(storageLimit)}
              </span>
            </div>
            <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  storagePercent > 90
                    ? 'bg-error'
                    : storagePercent > 70
                    ? 'bg-warning'
                    : 'bg-primary'
                }`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            {plan === 'free' && (
              <button
                onClick={() => navigate('/workspace/settings/billing')}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-primary hover:text-primary-hover font-medium rounded-lg hover:bg-primary-100/50 transition-colors"
              >
                <Crown size={14} />
                Upgrade for more storage
              </button>
            )}
          </div>
        )}

        {/* Bottom Nav Items */}
        <div className="space-y-1">
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
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default WorkspaceSidebar;
