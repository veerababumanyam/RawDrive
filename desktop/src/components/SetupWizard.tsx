/**
 * SetupWizard component for RawDrive Desktop Sync.
 * Feature: 029-pro-review-xmp-sync
 * Task: T070
 *
 * Initial setup wizard for API key authentication.
 */

import { useState } from 'react';
import { tauriApi, type LoginResult } from '../services/tauriApi';

interface SetupWizardProps {
  onComplete: () => void;
}

type WizardStep = 'welcome' | 'api-key' | 'success';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);

  const handleLogin = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await tauriApi.login(apiKey.trim());

      if (result.success) {
        setLoginResult(result);
        setStep('success');
      } else {
        setError(result.error || 'Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const renderWelcome = () => (
    <div className="wizard-step">
      <div className="wizard-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
      <h1>Welcome to RawDrive Sync</h1>
      <p className="wizard-description">
        Sync your local folders with RawDrive galleries. Keep your photos
        organized and backed up automatically.
      </p>
      <ul className="feature-list">
        <li>
          <span className="check-icon">✓</span>
          Automatic folder-to-gallery sync
        </li>
        <li>
          <span className="check-icon">✓</span>
          Bidirectional or one-way sync options
        </li>
        <li>
          <span className="check-icon">✓</span>
          XMP metadata preservation
        </li>
        <li>
          <span className="check-icon">✓</span>
          Secure credential storage
        </li>
      </ul>
      <button className="btn-primary" onClick={() => setStep('api-key')}>
        Get Started
      </button>
    </div>
  );

  const renderApiKeyStep = () => (
    <div className="wizard-step">
      <div className="wizard-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </div>
      <h1>Connect to RawDrive</h1>
      <p className="wizard-description">
        Enter your API key to connect. You can create an API key from your
        RawDrive workspace settings.
      </p>

      <div className="form-group">
        <label htmlFor="api-key">API Key</label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="rd_sync_xxxxxxxxxxxxxxxxxxxxxxxxxx"
          disabled={loading}
          autoFocus
        />
        <p className="form-hint">
          Find this in Workspace Settings → API Keys → Desktop Sync
        </p>
      </div>

      {error && (
        <div className="error-message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
          </svg>
          {error}
        </div>
      )}

      <div className="button-group">
        <button
          className="btn-secondary"
          onClick={() => setStep('welcome')}
          disabled={loading}
        >
          Back
        </button>
        <button
          className="btn-primary"
          onClick={handleLogin}
          disabled={loading || !apiKey.trim()}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="wizard-step">
      <div className="wizard-icon success">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h1>Connected Successfully!</h1>
      <p className="wizard-description">
        Your RawDrive account is now connected. You can start setting up folder
        mappings to sync your photos.
      </p>

      <div className="connection-info">
        <div className="info-row">
          <span className="info-label">Workspace</span>
          <span className="info-value">{loginResult?.workspace_id || 'Unknown'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Galleries Available</span>
          <span className="info-value">{loginResult?.galleries_accessible || 0}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Permissions</span>
          <span className="info-value">
            {loginResult?.permissions.join(', ') || 'None'}
          </span>
        </div>
      </div>

      <button className="btn-primary" onClick={onComplete}>
        Continue to App
      </button>
    </div>
  );

  return (
    <div className="setup-wizard">
      <div className="wizard-container">
        <div className="progress-dots">
          <span className={`dot ${step === 'welcome' ? 'active' : ''}`} />
          <span className={`dot ${step === 'api-key' ? 'active' : ''}`} />
          <span className={`dot ${step === 'success' ? 'active' : ''}`} />
        </div>

        {step === 'welcome' && renderWelcome()}
        {step === 'api-key' && renderApiKeyStep()}
        {step === 'success' && renderSuccess()}
      </div>
    </div>
  );
}

export default SetupWizard;
