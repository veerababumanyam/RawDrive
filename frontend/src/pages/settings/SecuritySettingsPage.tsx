/**
 * Security Settings Page
 * User Story 2: Manage Account Security Settings
 *
 * Allows users to manage their security settings including:
 * - Password change
 * - Two-factor authentication (TOTP)
 * - Backup codes
 * - Active sessions management
 */

import React, { useState } from 'react';
import { Shield, Key, Smartphone, Loader2 } from 'lucide-react';
import PasswordChangeForm from '../../components/settings/PasswordChangeForm';
import TwoFactorSetup from '../../components/settings/TwoFactorSetup';
import SessionList from '../../components/settings/SessionList';
import { useUserProfile } from '../../hooks/useUserSettings';

/* =============================================================================
   SecuritySettingsPage

   Security settings page with sections for:
   - Password change
   - Two-factor authentication
   - Active sessions management
   ============================================================================= */

type SecuritySection = 'password' | '2fa' | 'sessions';

interface SectionButtonProps {
  id: SecuritySection;
  icon: React.ReactNode;
  title: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

const SectionButton: React.FC<SectionButtonProps> = ({
  icon,
  title,
  description,
  isActive,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`w-full text-left p-4 rounded-xl border transition-all ${
      isActive
        ? 'bg-primary/5 border-primary/20'
        : 'bg-surface border-border hover:border-border-hover hover:bg-surface-hover'
    }`}
  >
    <div className="flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isActive ? 'bg-primary/10 text-primary' : 'bg-surface-hover text-text-secondary'
        }`}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary mt-0.5">{description}</p>
      </div>
    </div>
  </button>
);

const SecuritySettingsPage: React.FC = () => {
  const { profile, loading } = useUserProfile();
  const [activeSection, setActiveSection] = useState<SecuritySection>('password');

  // Loading state
  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Security Settings</h1>
        <p className="text-text-secondary mt-1">
          Manage your account security, password, and active sessions.
        </p>
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section navigation */}
        <div className="lg:col-span-1 space-y-3">
          <SectionButton
            id="password"
            icon={<Key className="w-5 h-5" />}
            title="Password"
            description="Update your password"
            isActive={activeSection === 'password'}
            onClick={() => setActiveSection('password')}
          />

          <SectionButton
            id="2fa"
            icon={<Smartphone className="w-5 h-5" />}
            title="Two-Factor Authentication"
            description={profile?.totp_enabled ? 'Enabled' : 'Not enabled'}
            isActive={activeSection === '2fa'}
            onClick={() => setActiveSection('2fa')}
          />

          <SectionButton
            id="sessions"
            icon={<Shield className="w-5 h-5" />}
            title="Active Sessions"
            description="Manage logged-in devices"
            isActive={activeSection === 'sessions'}
            onClick={() => setActiveSection('sessions')}
          />
        </div>

        {/* Section content */}
        <div className="lg:col-span-2">
          <div className="bg-surface rounded-2xl border border-border p-6">
            {/* Password Section */}
            {activeSection === 'password' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Change Password</h2>
                  <p className="text-sm text-text-secondary mt-1">
                    Choose a strong password that you don't use elsewhere.
                  </p>
                  {profile?.last_password_changed_at && (
                    <p className="text-xs text-text-tertiary mt-2">
                      Last changed:{' '}
                      {new Date(profile.last_password_changed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <PasswordChangeForm />
              </div>
            )}

            {/* 2FA Section */}
            {activeSection === '2fa' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Two-Factor Authentication
                  </h2>
                  <p className="text-sm text-text-secondary mt-1">
                    Add an extra layer of security to your account by requiring a code
                    from your phone when signing in.
                  </p>
                </div>

                <TwoFactorSetup />
              </div>
            )}

            {/* Sessions Section */}
            {activeSection === 'sessions' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Active Sessions</h2>
                  <p className="text-sm text-text-secondary mt-1">
                    These are the devices that are currently signed in to your account.
                    You can sign out of any session you don't recognize.
                  </p>
                </div>

                <SessionList />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettingsPage;
