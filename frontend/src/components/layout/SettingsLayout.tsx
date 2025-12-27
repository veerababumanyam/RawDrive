/**
 * SettingsLayout Component
 *
 * Layout wrapper for user settings pages.
 * Provides a sidebar navigation for settings sections:
 * - Profile
 * - Security
 * - Notifications
 * - Privacy
 * - Account (danger zone)
 */

import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  Shield,
  Bell,
  Lock,
  Trash2,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarItem,
} from './Sidebar';
import { AppButton } from '../ui/AppButton';

/* =============================================================================
   Settings Navigation Items
   ============================================================================= */

interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  description: string;
  danger?: boolean;
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: <User size={20} />,
    path: '/settings/profile',
    description: 'Manage your personal information and avatar',
  },
  {
    id: 'security',
    label: 'Security',
    icon: <Shield size={20} />,
    path: '/settings/security',
    description: 'Password, two-factor authentication, and sessions',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={20} />,
    path: '/settings/notifications',
    description: 'Email and in-app notification preferences',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: <Lock size={20} />,
    path: '/settings/privacy',
    description: 'Data export and privacy controls',
  },
  {
    id: 'ai',
    label: 'AI & Gemini',
    icon: <Sparkles size={20} />,
    path: '/settings/ai',
    description: 'Configure Gemini API key and model preferences',
  },
  {
    id: 'account',
    label: 'Account',
    icon: <Trash2 size={20} />,
    path: '/settings/account',
    description: 'Delete account',
    danger: true,
  },
];

/* =============================================================================
   SettingsLayout Component
   ============================================================================= */

interface SettingsLayoutProps {
  /** Page title displayed above the content */
  title?: string;
  /** Page description */
  description?: string;
  /** Optional children instead of Outlet */
  children?: React.ReactNode;
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  title,
  description,
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active section from current path
  const activeSection = SETTINGS_NAV_ITEMS.find((item) =>
    location.pathname.startsWith(item.path)
  )?.id || 'profile';

  // Find current section for title/description fallback
  const currentSection = SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection);

  return (
    <div className="flex h-full min-h-screen bg-background">
      {/* Settings Sidebar */}
      <aside
        className="w-64 flex-shrink-0 border-r border-border bg-surface hidden md:flex md:flex-col"
        aria-label="Settings navigation"
      >
        {/* Back to Dashboard */}
        <div className="p-4 border-b border-border">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="w-full justify-start text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={16} className="mr-2" />
            Back to Dashboard
          </AppButton>
        </div>

        {/* Settings Title */}
        <div className="px-6 py-4">
          <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Manage your account preferences
          </p>
        </div>

        {/* Navigation Items */}
        <Sidebar activeItem={activeSection} className="flex-1">
          <SidebarContent>
            <SidebarSection>
              {SETTINGS_NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={activeSection === item.id}
                  onClick={() => navigate(item.path)}
                  className={item.danger ? 'mt-4' : ''}
                  gradientActive={!item.danger}
                />
              ))}
            </SidebarSection>
          </SidebarContent>
        </Sidebar>
      </aside>

      {/* Mobile Navigation (Dropdown) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-surface border-b border-border p-4">
        <div className="flex items-center gap-4">
          <AppButton
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            aria-label="Back to dashboard"
          >
            <ChevronLeft size={20} />
          </AppButton>
          <select
            value={activeSection}
            onChange={(e) => {
              const item = SETTINGS_NAV_ITEMS.find((i) => i.id === e.target.value);
              if (item) navigate(item.path);
            }}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Navigate settings sections"
          >
            {SETTINGS_NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <header className="mb-8">
            <h2 className="text-2xl font-semibold text-text-primary">
              {title || currentSection?.label || 'Settings'}
            </h2>
            {(description || currentSection?.description) && (
              <p className="mt-2 text-text-secondary">
                {description || currentSection?.description}
              </p>
            )}
          </header>

          {/* Page Content */}
          <div className="space-y-6">
            {children || <Outlet />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsLayout;
