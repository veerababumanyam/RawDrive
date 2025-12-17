import React, { createContext, useContext, useState, useCallback } from 'react';

/* =============================================================================
   AppShell Component

   A responsive application shell that provides the main layout structure
   with header, sidebar, main content area, and optional footer.
   Supports mobile drawer navigation and collapsible sidebar.
   ============================================================================= */

interface AppShellContextType {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  toggleSidebar: () => void;
  toggleCollapse: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

const AppShellContext = createContext<AppShellContextType | null>(null);

export const useAppShell = () => {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used within an AppShell component');
  }
  return context;
};

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
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const toggleCollapse = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((prev) => !prev), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <AppShellContext.Provider
      value={{
        sidebarOpen,
        sidebarCollapsed,
        mobileMenuOpen,
        toggleSidebar,
        toggleCollapse,
        toggleMobileMenu,
        closeMobileMenu,
      }}
    >
      <div
        className={`
          min-h-screen
          bg-background
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
  className?: string;
}

export const AppShellHeader: React.FC<AppShellHeaderProps> = ({
  children,
  sticky = true,
  size = 'md',
  bordered = true,
  transparent = false,
  className = '',
}) => {
  const heightStyles = {
    sm: 'h-14',
    md: 'h-16',
    lg: 'h-20',
  };

  return (
    <header
      className={`
        ${heightStyles[size]}
        ${sticky ? 'sticky top-0 z-sticky' : ''}
        ${transparent ? 'glass' : 'bg-surface'}
        ${bordered ? 'border-b border-border' : ''}
        flex items-center
        px-4 lg:px-6
        ${className}
      `}
    >
      {children}
    </header>
  );
};

/* =============================================================================
   AppShell.Sidebar Component
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
  className?: string;
}

export const AppShellSidebar: React.FC<AppShellSidebarProps> = ({
  children,
  width = 280,
  collapsedWidth = 72,
  mobileOverlay = true,
  position = 'left',
  bordered = true,
  className = '',
}) => {
  const { sidebarOpen, sidebarCollapsed, mobileMenuOpen, closeMobileMenu } =
    useAppShell();

  const currentWidth = sidebarCollapsed ? collapsedWidth : width;

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {mobileOverlay && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-black/50 lg:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${position === 'left' ? 'left-0' : 'right-0'}
          ${bordered ? (position === 'left' ? 'border-r' : 'border-l') : ''}
          border-border
          bg-surface
          flex flex-col
          overflow-hidden
          transition-all duration-300 ease-out

          /* Mobile: Fixed overlay */
          fixed top-0 bottom-0 z-modal
          ${mobileMenuOpen ? 'translate-x-0' : position === 'left' ? '-translate-x-full' : 'translate-x-full'}

          /* Desktop: Static */
          lg:static lg:translate-x-0
          ${sidebarOpen ? '' : 'lg:hidden'}

          ${className}
        `}
        style={{
          width: `${currentWidth}px`,
          minWidth: `${currentWidth}px`,
        }}
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
