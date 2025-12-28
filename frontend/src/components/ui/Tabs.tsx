/**
 * Tabs Component
 *
 * Accessible tabbed interface following WAI-ARIA tabs pattern.
 * Supports keyboard navigation (Arrow keys, Home, End, Enter/Space).
 *
 * @see https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
 */

import { useRef, useCallback, type KeyboardEvent, type ComponentType } from 'react';

export interface TabItem<T extends string = string> {
  /** Unique identifier for this tab */
  id: T;
  /** Display label */
  label: string;
  /** Optional icon (Lucide component) */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Whether this tab represents a danger action */
  isDanger?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  /** Array of tab items */
  tabs: TabItem<T>[];
  /** Currently active tab ID */
  activeTab: T;
  /** Callback when tab selection changes */
  onTabChange: (tabId: T) => void;
  /** Accessible label for screen readers */
  ariaLabel: string;
  /** Additional CSS classes */
  className?: string;
  /** Tab size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show icons only on mobile (with labels visible on desktop) */
  iconsOnlyMobile?: boolean;
}

const sizeStyles = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-3 md:px-6 md:py-4 text-sm',
  lg: 'px-6 py-4 md:px-8 md:py-5 text-base',
};

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className = '',
  size = 'md',
  iconsOnlyMobile = false,
}: TabsProps<T>) {
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map());

  const focusTab = useCallback((tabId: T) => {
    const tabElement = tabRefs.current.get(tabId);
    tabElement?.focus();
  }, []);

  const getEnabledTabs = useCallback(() => {
    return tabs.filter((tab) => !tab.disabled);
  }, [tabs]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentTabId: T) => {
      const enabledTabs = getEnabledTabs();
      const currentIndex = enabledTabs.findIndex((tab) => tab.id === currentTabId);

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
          break;
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = enabledTabs.length - 1;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onTabChange(currentTabId);
          return;
        default:
          return;
      }

      if (nextIndex !== null) {
        const nextTab = enabledTabs[nextIndex];
        focusTab(nextTab.id);
        onTabChange(nextTab.id);
      }
    },
    [getEnabledTabs, focusTab, onTabChange]
  );

  const getTabClassName = (tab: TabItem<T>, isActive: boolean) => {
    const baseStyles = 'flex items-center gap-2 font-medium transition-colors whitespace-nowrap border-b-2 min-w-[44px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';
    const sizeStyle = sizeStyles[size];

    let stateStyles = '';
    if (isActive && !tab.isDanger) {
      stateStyles = 'border-primary text-primary';
    } else if (isActive && tab.isDanger) {
      stateStyles = 'border-error text-error';
    } else {
      stateStyles = 'border-transparent text-text-secondary hover:text-text-primary';
    }

    const disabledStyles = tab.disabled ? 'opacity-50 cursor-not-allowed hover:text-text-secondary' : '';

    return `${baseStyles} ${sizeStyle} ${stateStyles} ${disabledStyles}`.trim();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex border-b border-border overflow-x-auto scrollbar-hide ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(tab.id, el);
              } else {
                tabRefs.current.delete(tab.id);
              }
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            className={getTabClassName(tab, isActive)}
          >
            {Icon && (
              <Icon
                size={iconSize}
                className={`flex-shrink-0 ${iconsOnlyMobile ? 'md:mr-0' : ''}`}
              />
            )}
            <span className={iconsOnlyMobile ? 'hidden md:inline' : ''}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
