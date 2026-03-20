import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/* =============================================================================
   AppShell Component

   iOS-quality liquid glassmorphic application shell with animated gradient mesh
   Apple-tier visual quality with 80px blur, spring animations, and full dark mode

   Features:
   - Animated gradient mesh backgrounds (20-30s animation cycles)
   - 80px blur glass sidebar with iOS spring physics
   - Premium glass header with 30px blur
   - Full light/dark mode parity
   - WCAG AA accessibility compliance
   - Mobile-first responsive design with persistent state

   Layout Structure:
   - Header is fixed at the top (full width)
   - Sidebar starts BELOW the header (not from top)
   - Content area fills remaining space with gradient mesh
   - Sidebar is collapsible (hide/show) and remembers state
   ============================================================================= */

interface AppShellContextType {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  headerHeight: number;
  toggleSidebar: () => void;
  toggleCollapse: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  setSidebarOpen: (open: boolean) => void;
}

const AppShellContext = createContext<AppShellContextType | null>(null);

export const useAppShell = () => {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used within an AppShell component');
  }
  return context;
};

// Constants for consistent sizing
export const HEADER_HEIGHT = 64; // 16 * 4 = h-16
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export interface AppShellProps {
  children: React.ReactNode;
  /** Initial sidebar state */
  defaultSidebarOpen?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Fixed header */
  fixedHeader?: boolean;
  /** Layout variant */
  variant?: 'default' | 'compact' | 'wide';
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  defaultSidebarOpen = true,
  defaultCollapsed = false,
  variant = 'default',
  className = '',
}) => {
  // Load persisted state from localStorage
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rawdrive-sidebar-open');
      return saved !== null ? JSON.parse(saved) : defaultSidebarOpen;
    }
    return defaultSidebarOpen;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rawdrive-sidebar-collapsed');
      return saved !== null ? JSON.parse(saved) : defaultCollapsed;
    }
    return defaultCollapsed;
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('rawdrive-sidebar-open', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('rawdrive-sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev: boolean) => !prev), []);
  const toggleCollapse = useCallback(() => setSidebarCollapsed((prev: boolean) => !prev), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((prev) => !prev), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <AppShellContext.Provider
      value={{
        sidebarOpen,
        sidebarCollapsed,
        mobileMenuOpen,
        headerHeight: HEADER_HEIGHT,
        toggleSidebar,
        toggleCollapse,
        toggleMobileMenu,
        closeMobileMenu,
        setSidebarOpen,
      }}
    >
      <div
        className={`
          h-screen
          flex flex-col
          overflow-hidden
          mesh-gradient-light dark:mesh-gradient-dark
          text-text-primary
          ${className}
        `}
        data-variant={variant}
      >
        {children}
      </div>
    </AppShellContext.Provider>
  );
};

/* =============================================================================
   AppShell.Header Component
   ============================================================================= */

export interface AppShellHeaderProps {
  children: React.ReactNode;
  /** Make header sticky */
  sticky?: boolean;
  /** Header height variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show border bottom */
  bordered?: boolean;
  /** Transparent/glass background */
  transparent?: boolean;
  /** Use premium glass effect */
  glassPremium?: boolean;
  className?: string;
}

export const AppShellHeader: React.FC<AppShellHeaderProps> = ({
  children,
  sticky = true,
  size = 'md',
  bordered = true,
  transparent = false,
  glassPremium = false,
  className = '',
}) => {
  const heightStyles = {
    sm: 'h-14',
    md: 'h-16',
    lg: 'h-20',
  };

  // Determine background style with iOS glass
  const getBackgroundStyle = () => {
    if (glassPremium) {
      return `
        glass-ios dark:glass-ios-dark
        backdrop-blur-[30px]
        bg-white/70 dark:bg-slate-900/70
        border-b border-white/20 dark:border-white/5
        shadow-sm
      `;
    }
    if (transparent) {
      return `
        glass-ios dark:glass-ios-dark
        backdrop-blur-[20px]
      `;
    }
    return 'bg-surface backdrop-blur-[10px]';
  };

  return (
    <header
      className={`
        ${heightStyles[size]}
        ${sticky ? 'sticky top-0 z-sticky' : ''}
        ${getBackgroundStyle()}
        ${bordered && !glassPremium && !transparent ? 'border-b border-border/30' : ''}
        flex items-center
        px-4 lg:px-6
        transition-all duration-[var(--spring-duration-normal)] ease-[var(--spring-ios)]
        ${className}
      `}
    >
      {children}
    </header>
  );
};

/* =============================================================================
   AppShell.Sidebar Component

   IMPORTANT: Sidebar is positioned BELOW the header, not from top.
   - On mobile: Fixed overlay that slides in from left, starts below header
   - On desktop: Static sidebar in the flex layout
   ============================================================================= */

export interface AppShellSidebarProps {
  children: React.ReactNode;
  /** Width when expanded */
  width?: number;
  /** Width when collapsed */
  collapsedWidth?: number;
  /** Show on mobile as overlay */
  mobileOverlay?: boolean;
  /** Position */
  position?: 'left' | 'right';
  /** Bordered */
  bordered?: boolean;
  /** Use glass effect */
  glass?: boolean;
  className?: string;
}

export const AppShellSidebar: React.FC<AppShellSidebarProps> = ({
  children,
  width = SIDEBAR_WIDTH,
  collapsedWidth = SIDEBAR_COLLAPSED_WIDTH,
  mobileOverlay = true,
  position = 'left',
  bordered = true,
  glass = false,
  className = '',
}) => {
  const { sidebarOpen, sidebarCollapsed, mobileMenuOpen, closeMobileMenu, headerHeight } =
    useAppShell();

  const currentWidth = sidebarCollapsed ? collapsedWidth : width;

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {mobileOverlay && mobileMenuOpen && (
        <div
          className="
            fixed inset-0 z-40 lg:hidden
            bg-black/60 backdrop-blur-[40px] saturate-[180%]
            transition-opacity duration-[var(--spring-duration-normal)] ease-[var(--spring-ios)]
          "
          style={{
            top: `${headerHeight}px`,
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          }}
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${bordered ? (position === 'left' ? 'border-r' : 'border-l') : ''}
          ${bordered ? 'border-white/20 dark:border-white/5' : ''}
          ${glass ? 'glass-sidebar dark:glass-sidebar-dark mesh-gradient-sidebar dark:mesh-gradient-sidebar-dark' : 'bg-surface'}
          flex flex-col
          overflow-hidden
          transition-all duration-[var(--spring-duration-normal)] ease-[var(--spring-ios)]

          /* Mobile: Fixed overlay starting below header */
          fixed ${position === 'left' ? 'left-0' : 'right-0'} bottom-0 top-16 z-50
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : position === 'left' ? '-translate-x-full' : 'translate-x-full'}

          /* Desktop: Static in flex layout, starts from top */
          lg:relative lg:translate-x-0 lg:shadow-none lg:z-auto lg:top-0
          ${sidebarOpen ? '' : 'lg:hidden'}

          ${className}
        `}
        style={{
          width: `${currentWidth}px`,
          minWidth: `${currentWidth}px`,
        }}
        // Mobile: Start below header; Desktop: Handled by lg:top-0 class
        data-mobile-top={headerHeight}
        role="navigation"
        aria-label="Main navigation"
      >
        {children}
      </aside>
    </>
  );
};

/* =============================================================================
   AppShell.Main Component
   ============================================================================= */

export interface AppShellMainProps {
  children: React.ReactNode;
  /** Add padding */
  padded?: boolean;
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'none';
  /** Center content horizontally */
  centered?: boolean;
  className?: string;
}

export const AppShellMain: React.FC<AppShellMainProps> = ({
  children,
  padded = true,
  maxWidth = 'none',
  centered = false,
  className = '',
}) => {
  const maxWidthStyles = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full',
    none: '',
  };

  return (
    <main
      className={`
        flex-1
        min-h-0
        overflow-auto
        ${padded ? 'p-4 lg:p-6' : ''}
        ${maxWidthStyles[maxWidth]}
        ${centered ? 'mx-auto' : ''}
        ${className}
      `}
      id="main-content"
      role="main"
    >
      {children}
    </main>
  );
};

/* =============================================================================
   AppShell.Footer Component
   ============================================================================= */

export interface AppShellFooterProps {
  children: React.ReactNode;
  /** Sticky footer */
  sticky?: boolean;
  /** Show border top */
  bordered?: boolean;
  className?: string;
}

export const AppShellFooter: React.FC<AppShellFooterProps> = ({
  children,
  sticky = false,
  bordered = true,
  className = '',
}) => {
  return (
    <footer
      className={`
        h-14
        ${sticky ? 'sticky bottom-0' : ''}
        ${bordered ? 'border-t border-border' : ''}
        bg-surface
        flex items-center
        px-4 lg:px-6
        ${className}
      `}
    >
      {children}
    </footer>
  );
};

/* =============================================================================
   AppShell.Content Component (Wrapper for Sidebar + Main)

   This component creates the horizontal flex container for sidebar and main.
   It fills the remaining vertical space below the header.
   ============================================================================= */

export interface AppShellContentProps {
  children: React.ReactNode;
  className?: string;
}

export const AppShellContent: React.FC<AppShellContentProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`
        flex
        flex-1
        min-h-0
        overflow-hidden
        relative
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Compound Export
   ============================================================================= */

const AppShellCompound = Object.assign(AppShell, {
  Header: AppShellHeader,
  Sidebar: AppShellSidebar,
  Main: AppShellMain,
  Footer: AppShellFooter,
  Content: AppShellContent,
});

export { AppShellCompound as Shell };
export default AppShell;
