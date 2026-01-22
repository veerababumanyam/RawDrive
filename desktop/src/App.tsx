/**
 * Main App component for RawDrive Desktop Sync.
 * Feature: 029-pro-review-xmp-sync
 * Task: T073
 *
 * Root component with routing and auth state management.
 */

import { useState, useEffect, useCallback } from 'react';
import { tauriApi, type AuthStatus } from './services/tauriApi';
import SetupWizard from './components/SetupWizard';
import FolderMappingList from './components/FolderMappingList';
import SyncStatus from './components/SyncStatus';
import Settings from './components/Settings';
import './App.css';

type AppView = 'sync' | 'mappings' | 'settings';

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>('sync');
  const [validating, setValidating] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const status = await tauriApi.getAuthStatus();
      setAuthStatus(status);

      // If authenticated, validate the stored key
      if (status.authenticated) {
        setValidating(true);
        try {
          const validation = await tauriApi.validateStoredKey();
          if (!validation.success) {
            // Key is invalid, update auth status
            setAuthStatus({
              authenticated: false,
              workspace_id: null,
              user_id: null,
              api_key_prefix: null,
              error: validation.error || 'API key is no longer valid',
            });
          }
        } catch {
          // Validation failed, but don't log out yet - might be network issue
          console.warn('Failed to validate stored key');
        } finally {
          setValidating(false);
        }
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setAuthStatus({
        authenticated: false,
        workspace_id: null,
        user_id: null,
        api_key_prefix: null,
        error: 'Failed to check authentication status',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleSetupComplete = () => {
    checkAuth();
  };

  const handleLogout = () => {
    setAuthStatus({
      authenticated: false,
      workspace_id: null,
      user_id: null,
      api_key_prefix: null,
      error: null,
    });
    setCurrentView('sync');
  };

  // Loading state
  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-content">
          <div className="app-logo">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h1>RawDrive Sync</h1>
          <div className="loading-spinner" />
          <p>{validating ? 'Validating credentials...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show setup wizard
  if (!authStatus?.authenticated) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  // Main app view
  return (
    <div className="app">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-logo-small">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span className="app-name">RawDrive Sync</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${currentView === 'sync' ? 'active' : ''}`}
            onClick={() => setCurrentView('sync')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Sync Status</span>
          </button>

          <button
            className={`nav-item ${currentView === 'mappings' ? 'active' : ''}`}
            onClick={() => setCurrentView('mappings')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Folder Mappings</span>
          </button>

          <button
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-status">
            <span className="status-dot connected" />
            <span className="status-text">Connected</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {currentView === 'sync' && <SyncStatus />}
        {currentView === 'mappings' && <FolderMappingList />}
        {currentView === 'settings' && <Settings onLogout={handleLogout} />}
      </main>
    </div>
  );
}

export default App;
