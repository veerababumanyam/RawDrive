import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  HelpCircle,
  CreditCard,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import { useAppShell } from '../layout/AppShell';

/* =============================================================================
   WorkspaceHeader Component

   Top header bar for the workspace with search, notifications, and user menu.
   ============================================================================= */

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface WorkspaceHeaderProps {
  /** Current user */
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  /** Notifications */
  notifications?: NotificationItem[];
  /** Theme mode */
  theme?: 'light' | 'dark';
  /** Toggle theme callback */
  onToggleTheme?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  user = { name: 'John Doe', email: 'john@example.com' },
  notifications = [],
  theme = 'light',
  onToggleTheme,
}) => {
  const navigate = useNavigate();
  const { toggleMobileMenu, toggleCollapse, sidebarCollapsed } = useAppShell();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const userMenuItems = [
    { id: 'profile', label: 'Profile', icon: <User size={16} />, path: '/workspace/settings/profile' },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={16} />, path: '/workspace/settings/billing' },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} />, path: '/workspace/settings' },
    { id: 'help', label: 'Help & Support', icon: <HelpCircle size={16} />, path: '/workspace/help' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/workspace/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    // TODO: Implement logout logic
    navigate('/signin');
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-surface border-b border-border sticky top-0 z-sticky">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {/* Mobile Menu Button */}
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle mobile menu"
        >
          <Menu size={20} />
        </button>

        {/* Collapse Sidebar Button (Desktop) */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] items-center justify-center"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </button>

        {/* Search Bar (Desktop) */}
        <div className="hidden md:block relative">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-3 px-4 py-2 bg-surface-hover hover:bg-border/50 rounded-lg text-text-tertiary transition-colors min-w-[280px]"
          >
            <Search size={18} />
            <span className="text-sm">Search...</span>
            <kbd className="ml-auto text-xs bg-surface px-2 py-0.5 rounded border border-border">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}K
            </kbd>
          </button>
        </div>

        {/* Search Button (Mobile) */}
        <button
          onClick={() => setSearchOpen(true)}
          className="md:hidden p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Search"
        >
          <Search size={20} />
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications */}
        <div ref={notificationRef} className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center relative"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notificationsOpen}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-5 h-5 bg-error text-white text-xs font-medium rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-dropdown">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Notifications</h3>
                {unreadCount > 0 && (
                  <button className="text-xs text-primary hover:text-primary-hover">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-text-tertiary">
                    <Bell size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      className={`w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors ${
                        !notification.read ? 'bg-primary-50 dark:bg-primary-900/10' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                            notification.type === 'error'
                              ? 'bg-error'
                              : notification.type === 'warning'
                              ? 'bg-warning'
                              : notification.type === 'success'
                              ? 'bg-success'
                              : 'bg-info'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-text-tertiary mt-1">
                            {formatRelativeTime(notification.timestamp)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-3 border-t border-border">
                  <button
                    onClick={() => {
                      navigate('/workspace/notifications');
                      setNotificationsOpen(false);
                    }}
                    className="text-sm text-primary hover:text-primary-hover font-medium"
                  >
                    View all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="hidden sm:block text-sm font-medium text-text-primary max-w-[120px] truncate">
              {user.name}
            </span>
            <ChevronDown size={16} className="hidden sm:block text-text-tertiary" />
          </button>

          {/* User Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-dropdown">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-text-primary truncate">
                  {user.name}
                </p>
                <p className="text-xs text-text-tertiary truncate">{user.email}</p>
              </div>
              <div className="py-2">
                {userMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.path);
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-border py-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error-50 dark:hover:bg-error-900/10 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-modal-backdrop"
            onClick={() => setSearchOpen(false)}
          />
          <div className="fixed inset-x-4 top-20 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-xl z-modal">
            <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
              <form onSubmit={handleSearch} className="relative">
                <Search
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search galleries, photos, clients..."
                  className="w-full pl-12 pr-12 py-4 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none text-lg"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </form>
              <div className="px-4 py-3 border-t border-border bg-surface-hover/50">
                <p className="text-xs text-text-tertiary">
                  Press <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">Enter</kbd> to search or{' '}
                  <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">Esc</kbd> to close
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
};

// Helper function for relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default WorkspaceHeader;
