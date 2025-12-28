/**
 * TabPanel Component
 *
 * Accessible tab panel wrapper for content associated with a tab.
 * Uses role="tabpanel" with proper ARIA attributes.
 */

export interface TabPanelProps {
  /** Tab ID this panel belongs to */
  tabId: string;
  /** Whether this panel is currently active */
  isActive: boolean;
  /** Content to render */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export function TabPanel({ tabId, isActive, children, className = '' }: TabPanelProps) {
  if (!isActive) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`panel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={`focus-visible:outline-none ${className}`}
    >
      {children}
    </div>
  );
}

export default TabPanel;
