import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  User,
  Building2,
  Settings,
  LogOut,
  Moon,
  Sun,
  HelpCircle,
  CreditCard,
  X,
  Sparkles,
} from 'lucide-react';
import { useAppShell, HEADER_HEIGHT } from '../layout/AppShell';
import { useSearch } from '../../contexts/SearchContext';
import { AIHighlightsPanel } from '../features/ai/AIHighlightsPanel';
import { useAIHighlights } from '../../hooks/useAIHighlights';

/* =============================================================================
   WorkspaceHeader Component

   Top header bar for the workspace with:
   - RawDrive logo (matching landing page branding)
   - Search bar with keyboard shortcut
   - Notifications dropdown
   - User menu with settings
   - Theme toggle
   - Mobile menu toggle
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
  const { toggleMobileMenu } = useAppShell();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [aiHighlightsOpen, setAiHighlightsOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const aiHighlightsRef = useRef<HTMLDivElement>(null);

  // Fetch AI highlights
  const { highlights, isLoading: aiLoading, unreadCount: aiUnreadCount } = useAIHighlights({
    autoRefresh: true,
    refreshInterval: 120000, // 2 minutes
  });

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
      if (
        aiHighlightsRef.current &&
        !aiHighlightsRef.current.contains(event.target as Node)
      ) {
        setAiHighlightsOpen(false);
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
        setAiHighlightsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const userMenuItems = [
    { id: 'user-profile', label: 'My Profile', icon: <User size={16} />, path: '/settings?tab=profile' },
    { id: 'company-profile', label: 'Company Profile', icon: <Building2 size={16} />, path: '/workspace/settings/profile' },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={16} />, path: '/workspace/settings/billing' },
    { id: 'settings', label: 'Workspace Settings', icon: <Settings size={16} />, path: '/workspace/settings' },
    { id: 'help', label: 'Help & Support', icon: <HelpCircle size={16} />, path: '/workspace/help' },
  ];

  const { submitSearch, hasHandler } = useSearch();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const handled = submitSearch(searchQuery);
      if (!handled) {
        navigate(`/workspace/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchQuery('');
      }
      setSearchOpen(false);
    }
  };

  const handleLogout = () => {
    // TODO: Implement logout logic
    navigate('/signin');
  };

  return (
    <header
      className="grid grid-cols-[auto_1fr_auto] items-center px-4 lg:px-6 bg-surface border-b border-border/50 flex-shrink-0"
      style={{ height: `${HEADER_HEIGHT}px` }}
    >
      {/* Left Section - Logo */}
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button - Only visible on mobile */}
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle mobile menu"
        >
          <Menu size={20} />
        </button>

        {/* Logo - Matching Landing Page Branding */}
        <Link
          to="/workspace"
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          aria-label="RawDrive Dashboard"
        >
          <img
            src="/android-chrome-192x192.png"
            alt="RawDrive logo"
            className="w-8 h-8 rounded-lg shadow-sm"
            loading="eager"
          />
          <span className="hidden sm:block font-bold text-lg text-text-primary tracking-tight">
            Raw<span className="text-gradient">Drive</span>
          </span>
        </Link>
      </div>

      {/* Center Section - Search Bar */}
      <div className="flex justify-center px-4">
        {/* Search Bar (Desktop) */}
        <div className="hidden md:block relative w-full max-w-md">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2 bg-surface-hover hover:bg-border/50 rounded-lg text-text-tertiary transition-colors"
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

      {/* Right Section - Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* AI Insights Button */}
        <div ref={aiHighlightsRef} className="relative">
          <button
            onClick={() => setAiHighlightsOpen(!aiHighlightsOpen)}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center relative group"
            aria-label={`AI Insights${aiUnreadCount > 0 ? `, ${aiUnreadCount} alerts` : ''}`}
            aria-expanded={aiHighlightsOpen}
          >
            <Sparkles
              size={20}
              className="transition-all duration-300 group-hover:text-primary-500"
            />
            {aiUnreadCount > 0 && (
              <span className="absolute top-1 right-1 w-5 h-5 bg-gradient-to-br from-primary-500 to-accent-500 text-white text-xs font-medium rounded-full flex items-center justify-center animate-pulse">
                {aiUnreadCount > 9 ? '9+' : aiUnreadCount}
              </span>
            )}
            {!aiLoading && highlights.length > 0 && aiUnreadCount === 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-success-500 rounded-full" />
            )}
          </button>

          {/* AI Highlights Dropdown */}
          {aiHighlightsOpen && (
            <div className="absolute right-0 top-full mt-2 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-dropdown">
              <AIHighlightsPanel
                workspaceId=""
                highlights={highlights}
                isLoading={aiLoading}
                onClose={() => setAiHighlightsOpen(false)}
              />
            </div>
          )}
        </div>

        {/* AI Settings Button */}
        <button
          onClick={() => navigate('/settings?tab=ai')}
          className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="AI Settings"
          title="AI Settings"
        >
          <Settings size={20} />
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
                      className={`w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors ${!notification.read ? 'bg-primary-50 dark:bg-primary-900/10' : ''
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${notification.type === 'error'
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
                  placeholder={hasHandler ? "Search in this view..." : "Search galleries, photos, clients..."}
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
