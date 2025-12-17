import React, { createContext, useContext, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/* =============================================================================
   Sidebar Component

   A navigation sidebar component with support for collapsible sections,
   nested items, badges, and icons.
   ============================================================================= */

interface SidebarContextType {
  collapsed: boolean;
  activeItem: string | null;
  setActiveItem: (id: string) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  activeItem: null,
  setActiveItem: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export interface SidebarProps {
  children: React.ReactNode;
  /** Collapsed state (icon-only mode) */
  collapsed?: boolean;
  /** Currently active item ID */
  activeItem?: string | null;
  /** Callback when active item changes */
  onActiveChange?: (id: string) => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  children,
  collapsed = false,
  activeItem = null,
  onActiveChange,
  className = '',
}) => {
  const [internalActive, setInternalActive] = useState<string | null>(activeItem);

  const handleSetActive = (id: string) => {
    setInternalActive(id);
    onActiveChange?.(id);
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        activeItem: activeItem ?? internalActive,
        setActiveItem: handleSetActive,
      }}
    >
      <nav
        className={`
          flex flex-col
          h-full
          overflow-hidden
          ${className}
        `}
        aria-label="Sidebar navigation"
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  );
};

/* =============================================================================
   Sidebar.Header Component
   ============================================================================= */

export interface SidebarHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`
        flex items-center
        h-16
        px-4
        border-b border-border
        flex-shrink-0
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Sidebar.Content Component
   ============================================================================= */

export interface SidebarContentProps {
  children: React.ReactNode;
  className?: string;
}

export const SidebarContent: React.FC<SidebarContentProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`
        flex-1
        overflow-y-auto
        overflow-x-hidden
        py-4
        scrollbar-thin
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Sidebar.Footer Component
   ============================================================================= */

export interface SidebarFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`
        flex-shrink-0
        border-t border-border
        p-4
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Sidebar.Section Component
   ============================================================================= */

export interface SidebarSectionProps {
  children: React.ReactNode;
  /** Section title */
  title?: string;
  /** Collapsible section */
  collapsible?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
  className?: string;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  children,
  title,
  collapsible = false,
  defaultExpanded = true,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { collapsed: sidebarCollapsed } = useSidebar();

  if (sidebarCollapsed && title) {
    return (
      <div className={`px-2 py-2 ${className}`}>
        <div className="h-px bg-border my-2" aria-hidden="true" />
        {children}
      </div>
    );
  }

  return (
    <div className={`px-2 py-2 ${className}`}>
      {title && (
        <div
          className={`
            flex items-center justify-between
            px-3 py-2
            ${collapsible ? 'cursor-pointer hover:bg-surface-hover rounded-lg' : ''}
          `}
          onClick={collapsible ? () => setExpanded(!expanded) : undefined}
          role={collapsible ? 'button' : undefined}
          aria-expanded={collapsible ? expanded : undefined}
        >
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            {title}
          </span>
          {collapsible && (
            <ChevronDown
              size={16}
              className={`
                text-text-tertiary
                transition-transform duration-200
                ${expanded ? '' : '-rotate-90'}
              `}
            />
          )}
        </div>
      )}
      {(!collapsible || expanded) && <div className="space-y-1">{children}</div>}
    </div>
  );
};

/* =============================================================================
   Sidebar.Item Component
   ============================================================================= */

export interface SidebarItemProps {
  /** Unique identifier */
  id: string;
  /** Label text */
  label: string;
  /** Icon component */
  icon?: React.ReactNode;
  /** Badge content */
  badge?: React.ReactNode;
  /** Is item active */
  active?: boolean;
  /** Is item disabled */
  disabled?: boolean;
  /** Has nested items */
  hasChildren?: boolean;
  /** Default expanded (for items with children) */
  defaultExpanded?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Link href (renders as anchor) */
  href?: string;
  /** Nested items */
  children?: React.ReactNode;
  className?: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  label,
  icon,
  badge,
  active: activeProp,
  disabled = false,
  hasChildren = false,
  defaultExpanded = false,
  onClick,
  href,
  children,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { collapsed, activeItem, setActiveItem } = useSidebar();

  const isActive = activeProp ?? activeItem === id;
  const hasNestedItems = hasChildren || React.Children.count(children) > 0;

  const handleClick = () => {
    if (disabled) return;

    if (hasNestedItems) {
      setExpanded(!expanded);
    } else {
      setActiveItem(id);
      onClick?.();
    }
  };

  const baseStyles = `
    group
    flex items-center
    w-full
    px-3
    ${collapsed ? 'justify-center' : ''}
    py-2.5
    rounded-lg
    text-sm font-medium
    transition-all duration-150 ease-out
    outline-none
    focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
  `;

  const stateStyles = disabled
    ? 'opacity-50 cursor-not-allowed'
    : isActive
    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary';

  const Component = href && !disabled ? 'a' : 'button';

  const content = (
    <>
      {icon && (
        <span
          className={`
            flex-shrink-0
            ${collapsed ? '' : 'mr-3'}
            ${isActive ? 'text-primary' : 'text-text-tertiary group-hover:text-text-secondary'}
          `}
        >
          {icon}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {badge && <span className="flex-shrink-0 ml-2">{badge}</span>}
          {hasNestedItems && (
            <ChevronRight
              size={16}
              className={`
                flex-shrink-0 ml-2
                text-text-tertiary
                transition-transform duration-200
                ${expanded ? 'rotate-90' : ''}
              `}
            />
          )}
        </>
      )}
    </>
  );

  return (
    <div className={className}>
      <Component
        className={`${baseStyles} ${stateStyles}`}
        onClick={handleClick}
        href={href}
        disabled={disabled}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={hasNestedItems ? expanded : undefined}
        title={collapsed ? label : undefined}
      >
        {content}
      </Component>
      {hasNestedItems && expanded && !collapsed && (
        <div className="ml-6 mt-1 space-y-1 border-l border-border pl-3">
          {children}
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   Sidebar.Divider Component
   ============================================================================= */

export const SidebarDivider: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  return (
    <div
      className={`h-px bg-border mx-4 my-2 ${className}`}
      role="separator"
      aria-hidden="true"
    />
  );
};

/* =============================================================================
   Compound Export
   ============================================================================= */

const SidebarCompound = Object.assign(Sidebar, {
  Header: SidebarHeader,
  Content: SidebarContent,
  Footer: SidebarFooter,
  Section: SidebarSection,
  Item: SidebarItem,
  Divider: SidebarDivider,
});

export { SidebarCompound as Nav };
export default Sidebar;
