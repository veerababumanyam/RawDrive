import React from 'react';

/**
 * SettingsSectionDivider Component
 *
 * Visual separator between settings sections. Can optionally display
 * a label (e.g., "Related Settings", "Privacy & Data") centered above the divider.
 */

interface SettingsSectionDividerProps {
  /**
   * Optional label to display above the divider
   * Will be displayed in uppercase with tracking-wider
   */
  label?: string;
}

export const SettingsSectionDivider: React.FC<SettingsSectionDividerProps> = ({ label }) => {
  if (!label) {
    return <div className="my-8 border-t border-white/10" />;
  }

  return (
    <div className="relative my-8">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10" />
      </div>
      <div className="relative flex justify-center">
        <span className="px-3 py-1 text-xs font-medium text-text-tertiary uppercase tracking-wider glass-light rounded-full">
          {label}
        </span>
      </div>
    </div>
  );
};

export default SettingsSectionDivider;
