import React from 'react';
import { User, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../ui/index';

/**
 * ScopeIndicator Component
 *
 * Displays a badge indicating the current settings scope (Personal or Workspace)
 * with an optional switcher button to navigate between scopes.
 */

interface ScopeIndicatorProps {
  /**
   * Current scope: 'personal' for personal settings, 'workspace' for workspace settings
   */
  scope: 'personal' | 'workspace';
  /**
   * Show an optional button to switch to the other scope
   */
  showSwitcher?: boolean;
  /**
   * Optional callback for custom scope switching behavior
   * If not provided, defaults to navigate to /workspace/settings or /settings
   */
  onSwitchScope?: () => void;
}

export const ScopeIndicator: React.FC<ScopeIndicatorProps> = ({
  scope,
  showSwitcher = false,
  onSwitchScope,
}) => {
  const navigate = useNavigate();

  const Icon = scope === 'personal' ? User : Building2;
  const label = scope === 'personal' ? 'Personal Settings' : 'Workspace Settings';
  const switchLabel = scope === 'personal' ? 'Workspace Settings' : 'Personal Settings';
  const switchPath = scope === 'personal' ? '/workspace/settings' : '/settings';

  const handleSwitch = () => {
    if (onSwitchScope) {
      onSwitchScope();
    } else {
      navigate(switchPath);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
        <Icon size={16} />
        <span>{label}</span>
      </div>
      {showSwitcher && (
        <AppButton
          variant="ghost"
          size="sm"
          onClick={handleSwitch}
          className="text-sm w-full sm:w-auto"
        >
          <span className="hidden sm:inline">Switch to {switchLabel} →</span>
          <span className="sm:hidden">{switchLabel} →</span>
        </AppButton>
      )}
    </div>
  );
};

export default ScopeIndicator;
