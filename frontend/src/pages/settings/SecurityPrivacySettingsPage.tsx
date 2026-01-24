/**
 * Security & Privacy Settings Page
 *
 * Merged page combining security and privacy settings with clear section separation.
 * This component is used when Security and Privacy are consolidated into a single tab.
 */

import React from 'react';
import SecuritySettingsPage from './SecuritySettingsPage';
import PrivacySettingsPage from './PrivacySettingsPage';
import { SettingsSectionDivider } from '../../components/settings/SettingsSectionDivider';

/* =============================================================================
   SecurityPrivacySettingsPage

   Combined page for security and privacy settings with two main sections:
   - Security: Password, 2FA, Active Sessions
   - Privacy & Data: Analytics, Public Profile, Data Export
   ============================================================================= */

export const SecurityPrivacySettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Security Section */}
      <div>
        <SecuritySettingsPage />
      </div>

      <SettingsSectionDivider />

      {/* Privacy & Data Section */}
      <div>
        <PrivacySettingsPage />
      </div>
    </div>
  );
};

export default SecurityPrivacySettingsPage;
