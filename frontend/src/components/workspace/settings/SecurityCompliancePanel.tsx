import React from 'react';
import { Shield, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { WorkspaceSecuritySettingsPanel } from './WorkspaceSecuritySettingsPanel';
import { BiometricSettingsPanel } from './BiometricSettingsPanel';
import { SettingsSectionDivider } from '../../settings/SettingsSectionDivider';

/**
 * Security & Compliance Panel
 *
 * Unified security and compliance settings combining:
 * - Workspace security policies (2FA enforcement, session timeout)
 * - Biometric settings (face recognition, consent)
 * - Compliance settings (GDPR mode, analytics, search indexing)
 */

interface SecurityCompliancePanelProps {
  workspaceId: string;
}

export const SecurityCompliancePanel: React.FC<SecurityCompliancePanelProps> = ({
  workspaceId,
}) => {
  return (
    <div className="space-y-8">
      {/* Security Policies Section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Security Policies</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure security requirements for all team members
            </p>
          </div>
        </div>
        <div className="border-l-2 border-primary/20 pl-4 ml-2">
          <WorkspaceSecuritySettingsPanel workspaceId={workspaceId} />
        </div>
      </div>

      <SettingsSectionDivider />

      {/* Biometric Settings Section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Lock size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Biometric Settings</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Manage face recognition and biometric consent
            </p>
          </div>
        </div>
        <div className="border-l-2 border-primary/20 pl-4 ml-2">
          <BiometricSettingsPanel workspaceId={workspaceId} />
        </div>
      </div>

      <SettingsSectionDivider />

      {/* Compliance & Privacy Section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <CheckCircle size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Compliance & Privacy</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure GDPR compliance, analytics, and data handling
            </p>
          </div>
        </div>
        <div className="space-y-4 pl-4 ml-2 border-l-2 border-primary/20">
          <div className="p-4 rounded-xl glass-light border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={16} className="text-accent" />
              <h3 className="font-medium text-text-primary">GDPR Compliance Mode</h3>
            </div>
            <p className="text-sm text-text-secondary">
              Enable strict data handling and export capabilities for GDPR compliance.
            </p>
            <div className="mt-4 p-3 bg-surface/30 rounded-lg text-sm text-text-secondary">
              GDPR settings configuration will be displayed here.
            </div>
          </div>

          <div className="p-4 rounded-xl glass-light border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle size={16} className="text-primary" />
              <h3 className="font-medium text-text-primary">Analytics & Search Indexing</h3>
            </div>
            <p className="text-sm text-text-secondary">
              Control workspace analytics collection and search engine indexing preferences.
            </p>
            <div className="mt-4 p-3 bg-surface/30 rounded-lg text-sm text-text-secondary">
              Analytics and indexing preferences will be displayed here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityCompliancePanel;
