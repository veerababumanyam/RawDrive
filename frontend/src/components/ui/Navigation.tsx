import React, { createContext, useContext, useState, useCallback } from 'react';
import { ChevronRight, ChevronLeft, MoreHorizontal } from 'lucide-react';

/* =============================================================================
   Tabs Component
   ============================================================================= */

interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
  variant: 'default' | 'pills' | 'underline' | 'segmented';
  size: 'sm' | 'md' | 'lg';
}

const TabsContext = createContext<TabsContextType | null>(null);

const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab components must be used within Tabs');
  return context;
};

export interface TabsProps {
  /** Currently active tab ID */
  value?: string;
  /** Default active tab ID */
  defaultValue?: string;
  /** Tab change handler */
  onChange?: (value: string) => void;
  /** Visual variant */
  variant?: 'default' | 'pills' | 'underline' | 'segmented';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width tabs */
  fullWidth?: boolean;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  value,
  defaultValue,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  orientation = 'horizontal',
  children,
  className = '',
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const activeTab = value ?? internalValue;

  const setActiveTab = useCallback(
    (id: string) => {
      setInternalValue(id);
      onChange?.(id);
    },
    [onChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, variant, size }}>
      <div
        className={`
          ${orientation === 'vertical' ? 'flex' : ''}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        data-orientation={orientation}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
};

/* =============================================================================
   TabList Component
   ============================================================================= */

export interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

export const TabList: React.FC<TabListProps> = ({ children, className = '' }) => {
  const { variant } = useTabs();

  const variantContainerStyles = {
    default: 'border-b border-border',
    pills: 'gap-1',
    underline: 'border-b border-border',
    segmented: 'p-1 bg-background-alt rounded-lg gap-1',
  };

  return (
    <div
      role="tablist"
      className={`
        flex
        ${variantContainerStyles[variant]}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Tab Component
   ============================================================================= */

export interface TabProps {
  /** Unique tab identifier */
  value: string;
  /** Tab label */
  children: React.ReactNode;
  /** Icon before label */
  icon?: React.ReactNode;
  /** Badge/count after label */
  badge?: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
  className?: string;
}

export const Tab: React.FC<TabProps> = ({
  value,
  children,
  icon,
  badge,
  disabled = false,
  className = '',
}) => {
  const { activeTab, setActiveTab, variant, size } = useTabs();
  const isActive = activeTab === value;

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  };

  const variantStyles = {
    default: `
      border-b-2 -mb-px
      ${isActive
        ? 'border-primary text-primary'
        : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'}
    `,
    pills: `
      rounded-lg
      ${isActive
        ? 'bg-primary text-white shadow-sm'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}
    `,
    underline: `
      border-b-2 -mb-px
      ${isActive
        ? 'border-primary text-primary'
        : 'border-transparent text-text-secondary hover:text-text-primary'}
    `,
    segmented: `
      rounded-md
      ${isActive
        ? 'bg-surface text-text-primary shadow-sm'
        : 'text-text-secondary hover:text-text-primary'}
    `,
  };

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={`
        inline-flex items-center justify-center
        font-medium
        transition-all duration-150 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {badge && <span className="flex-shrink-0">{badge}</span>}
    </button>
  );
};

/* =============================================================================
   TabPanels & TabPanel Components
   ============================================================================= */

export interface TabPanelsProps {
  children: React.ReactNode;
  className?: string;
}

export const TabPanels: React.FC<TabPanelsProps> = ({ children, className = '' }) => {
  return <div className={className}>{children}</div>;
};

export interface TabPanelProps {
  /** Tab value this panel is associated with */
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({ value, children, className = '' }) => {
  const { activeTab } = useTabs();

  if (activeTab !== value) return null;

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={`focus-visible:outline-none ${className}`}
    >
      {children}
    </div>
  );
};

/* =============================================================================
   Breadcrumb Component
   ============================================================================= */

export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Link href (optional - last item typically has no href) */
  href?: string;
  /** Icon before label */
  icon?: React.ReactNode;
}

export interface BreadcrumbProps {
  /** Breadcrumb items */
  items: BreadcrumbItem[];
  /** Separator between items */
  separator?: React.ReactNode;
  /** Max items to show before collapsing */
  maxItems?: number;
  /** Click handler for items */
  onItemClick?: (item: BreadcrumbItem, index: number) => void;
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  separator = <ChevronRight size={14} className="text-text-tertiary" />,
  maxItems,
  onItemClick,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);

  const shouldCollapse = maxItems && items.length > maxItems && !expanded;
  const visibleItems = shouldCollapse
    ? [items[0], ...items.slice(-2)]
    : items;

  const handleClick = (item: BreadcrumbItem, index: number, e: React.MouseEvent) => {
    if (onItemClick) {
      e.preventDefault();
      onItemClick(item, index);
    }
  };

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center flex-wrap gap-1">
        {visibleItems.map((item, index) => {
          const isLast = index === visibleItems.length - 1;
          const originalIndex = shouldCollapse && index > 0
            ? items.length - (visibleItems.length - index)
            : index;

          // Show ellipsis after first item when collapsed
          const showEllipsis = shouldCollapse && index === 1;

          return (
            <React.Fragment key={`${item.label}-${originalIndex}`}>
              {showEllipsis && (
                <>
                  <li className="flex items-center">
                    <button
                      onClick={() => setExpanded(true)}
                      className="
                        p-1
                        text-text-tertiary
                        hover:text-text-secondary hover:bg-surface-hover
                        rounded
                        transition-colors
                      "
                      aria-label="Show full breadcrumb"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </li>
                  <li className="flex items-center" aria-hidden="true">
                    {separator}
                  </li>
                </>
              )}
              {index > 0 && !showEllipsis && (
                <li className="flex items-center" aria-hidden="true">
                  {separator}
                </li>
              )}
              <li className="flex items-center">
                {item.href && !isLast ? (
                  <a
                    href={item.href}
                    onClick={(e) => handleClick(item, originalIndex, e)}
                    className="
                      inline-flex items-center gap-1.5
                      text-sm text-text-secondary
                      hover:text-primary
                      transition-colors
                    "
                  >
                    {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                    {item.label}
                  </a>
                ) : (
                  <span
                    className={`
                      inline-flex items-center gap-1.5
                      text-sm
                      ${isLast ? 'text-text-primary font-medium' : 'text-text-secondary'}
                    `}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                    {item.label}
                  </span>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

/* =============================================================================
   Pagination Component
   ============================================================================= */

export interface PaginationProps {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Number of page buttons to show */
  siblingCount?: number;
  /** Show first/last buttons */
  showFirstLast?: boolean;
  /** Show previous/next buttons */
  showPrevNext?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Variant */
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showFirstLast = true,
  showPrevNext = true,
  size = 'md',
  variant = 'default',
  className = '',
}) => {
  // Generate page numbers array with ellipsis
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const leftSibling = Math.max(currentPage - siblingCount, 1);
    const rightSibling = Math.min(currentPage + siblingCount, totalPages);

    const showLeftEllipsis = leftSibling > 2;
    const showRightEllipsis = rightSibling < totalPages - 1;

    if (!showLeftEllipsis) {
      for (let i = 1; i <= Math.min(3 + siblingCount, totalPages); i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      pages.push('ellipsis');
    }

    if (showLeftEllipsis) {
      for (let i = leftSibling; i <= rightSibling; i++) {
        if (i > 1 && i < totalPages) pages.push(i);
      }
    }

    if (showRightEllipsis) {
      if (!pages.includes('ellipsis') || pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
      pages.push(totalPages);
    } else if (totalPages > 1 && !pages.includes(totalPages)) {
      for (let i = Math.max(totalPages - 2 - siblingCount, rightSibling + 1); i <= totalPages; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
    }

    return pages;
  };

  const sizeStyles = {
    sm: 'h-7 min-w-[28px] text-xs',
    md: 'h-9 min-w-[36px] text-sm',
    lg: 'h-11 min-w-[44px] text-base',
  };

  const buttonBaseStyles = `
    inline-flex items-center justify-center
    font-medium
    rounded-lg
    transition-all duration-150 ease-out
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${sizeStyles[size]}
  `;

  const variantStyles = {
    default: (isActive: boolean) =>
      isActive
        ? 'bg-primary text-white'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
    outline: (isActive: boolean) =>
      isActive
        ? 'bg-primary text-white border border-primary'
        : 'border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary',
    ghost: (isActive: boolean) =>
      isActive
        ? 'bg-primary-100 text-primary dark:bg-primary-900/30'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  };

  const pages = getPageNumbers();

  return (
    <nav aria-label="Pagination" className={`flex items-center gap-1 ${className}`}>
      {showFirstLast && (
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={`${buttonBaseStyles} ${variantStyles[variant](false)} px-2`}
          aria-label="First page"
        >
          <ChevronLeft size={size === 'sm' ? 14 : 16} />
          <ChevronLeft size={size === 'sm' ? 14 : 16} className="-ml-2" />
        </button>
      )}

      {showPrevNext && (
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`${buttonBaseStyles} ${variantStyles[variant](false)} px-2`}
          aria-label="Previous page"
        >
          <ChevronLeft size={size === 'sm' ? 14 : 16} />
        </button>
      )}

      {pages.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <span
              key={`ellipsis-${index}`}
              className={`${sizeStyles[size]} flex items-center justify-center text-text-tertiary`}
            >
              ...
            </span>
          );
        }

        const isActive = page === currentPage;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`${buttonBaseStyles} ${variantStyles[variant](isActive)} px-3`}
            aria-current={isActive ? 'page' : undefined}
          >
            {page}
          </button>
        );
      })}

      {showPrevNext && (
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`${buttonBaseStyles} ${variantStyles[variant](false)} px-2`}
          aria-label="Next page"
        >
          <ChevronRight size={size === 'sm' ? 14 : 16} />
        </button>
      )}

      {showFirstLast && (
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={`${buttonBaseStyles} ${variantStyles[variant](false)} px-2`}
          aria-label="Last page"
        >
          <ChevronRight size={size === 'sm' ? 14 : 16} />
          <ChevronRight size={size === 'sm' ? 14 : 16} className="-ml-2" />
        </button>
      )}
    </nav>
  );
};

/* =============================================================================
   Compound Exports
   ============================================================================= */

const TabsCompound = Object.assign(Tabs, {
  List: TabList,
  Tab,
  Panels: TabPanels,
  Panel: TabPanel,
});

export { TabsCompound as TabsNav };

export default {
  Tabs: TabsCompound,
  Breadcrumb,
  Pagination,
};
