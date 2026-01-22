/**
 * Settings component for RawDrive Desktop Sync.
 * Feature: 029-pro-review-xmp-sync
 * Task: T072
 *
 * Application settings and preferences.
 */

import { useState, useEffect, useCallback } from 'react';
import { tauriApi, type AppSettings, type AuthStatus } from '../services/tauriApi';

interface SettingsProps {
  onLogout: () => void;
}

export function Settings({ onLogout }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsData, authData] = await Promise.all([
        tauriApi.getSettings(),
        tauriApi.getAuthStatus(),
      ]);
      setSettings(settingsData);
      setAuthStatus(authData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await tauriApi.updateSettings(settings);
      setSettings(updated);
      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to disconnect from RawDrive?')) {
      return;
    }

    try {
      await tauriApi.logout();
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to logout');
    }
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  if (loading) {
    return (
      <div className="settings loading">
        <div className="loading-spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      {error && (
        <div className="error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
          </svg>
          {error}
        </div>
      )}

      {successMessage && (
        <div className="success-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Account Section */}
      <section className="settings-section">
        <h3>Account</h3>
        <div className="account-info">
          <div className="account-status">
            <span
              className={`status-indicator ${authStatus?.authenticated ? 'connected' : 'disconnected'}`}
            />
            <span>
              {authStatus?.authenticated ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {authStatus?.authenticated && (
            <>
              <div className="info-row">
                <span className="label">Workspace</span>
                <span className="value">{authStatus.workspace_id || 'Unknown'}</span>
              </div>
              <div className="info-row">
                <span className="label">API Key</span>
                <span className="value">{authStatus.api_key_prefix}...</span>
              </div>
            </>
          )}
          <button className="btn-danger btn-sm" onClick={handleLogout}>
            Disconnect
          </button>
        </div>
      </section>

      {/* Sync Settings */}
      {settings && (
        <>
          <section className="settings-section">
            <h3>Sync Settings</h3>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="sync-interval">Sync Interval</label>
                <p className="setting-description">
                  How often to check for changes (in seconds)
                </p>
              </div>
              <div className="setting-control">
                <input
                  id="sync-interval"
                  type="number"
                  min="30"
                  max="3600"
                  value={settings.sync_interval_seconds}
                  onChange={(e) =>
                    updateSetting(
                      'sync_interval_seconds',
                      parseInt(e.target.value) || 60
                    )
                  }
                />
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="max-uploads">Max Concurrent Uploads</label>
                <p className="setting-description">
                  Number of files to upload simultaneously
                </p>
              </div>
              <div className="setting-control">
                <input
                  id="max-uploads"
                  type="number"
                  min="1"
                  max="10"
                  value={settings.max_concurrent_uploads}
                  onChange={(e) =>
                    updateSetting(
                      'max_concurrent_uploads',
                      parseInt(e.target.value) || 3
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>App Behavior</h3>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="start-on-login">Start on Login</label>
                <p className="setting-description">
                  Launch RawDrive Sync when you log in
                </p>
              </div>
              <div className="setting-control">
                <button
                  id="start-on-login"
                  className={`toggle ${settings.start_on_login ? 'on' : 'off'}`}
                  onClick={() =>
                    updateSetting('start_on_login', !settings.start_on_login)
                  }
                >
                  <span className="toggle-slider" />
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="minimize-to-tray">Minimize to Tray</label>
                <p className="setting-description">
                  Keep running in system tray when window is closed
                </p>
              </div>
              <div className="setting-control">
                <button
                  id="minimize-to-tray"
                  className={`toggle ${settings.minimize_to_tray ? 'on' : 'off'}`}
                  onClick={() =>
                    updateSetting('minimize_to_tray', !settings.minimize_to_tray)
                  }
                >
                  <span className="toggle-slider" />
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="show-notifications">Show Notifications</label>
                <p className="setting-description">
                  Display notifications for sync events
                </p>
              </div>
              <div className="setting-control">
                <button
                  id="show-notifications"
                  className={`toggle ${settings.show_notifications ? 'on' : 'off'}`}
                  onClick={() =>
                    updateSetting('show_notifications', !settings.show_notifications)
                  }
                >
                  <span className="toggle-slider" />
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="menubar-status">Menu Bar Status</label>
                <p className="setting-description">
                  Show sync status icon in the menu bar
                </p>
              </div>
              <div className="setting-control">
                <button
                  id="menubar-status"
                  className={`toggle ${settings.show_menubar_status ? 'on' : 'off'}`}
                  onClick={() =>
                    updateSetting('show_menubar_status', !settings.show_menubar_status)
                  }
                >
                  <span className="toggle-slider" />
                </button>
              </div>
            </div>
          </section>

          <div className="settings-actions">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </>
      )}

      {/* About Section */}
      <section className="settings-section about">
        <h3>About</h3>
        <div className="about-info">
          <p>
            <strong>RawDrive Desktop Sync</strong>
          </p>
          <p>Version 0.1.0</p>
          <p className="copyright">© 2026 RawDrive. All rights reserved.</p>
        </div>
      </section>
    </div>
  );
}

export default Settings;
