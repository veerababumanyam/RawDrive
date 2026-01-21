/**
 * Tests for Biometric Settings Panel Component
 *
 * GDPR Article 9 compliant biometric consent management UI tests.
 * Feature: Face Detection Audit Remediation (002-face-audit-remediation)
 * Task: T030
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BiometricSettingsPanel } from '../BiometricSettingsPanel';
import { biometricConsentService } from '../../../../services/biometricConsentService';
import type {
  BiometricSettingsResponse,
  ConsentHistoryEntry,
  ConsentHistoryResponse,
} from '../../../../types/biometricConsent';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

vi.mock('../../../../services/biometricConsentService');

const mockGetSettings = vi.mocked(biometricConsentService.getSettings);
const mockGetHistory = vi.mocked(biometricConsentService.getHistory);
const mockGrantConsent = vi.mocked(biometricConsentService.grantConsent);
const mockWithdrawConsent = vi.mocked(biometricConsentService.withdrawConsent);
const mockUpdateSettings = vi.mocked(biometricConsentService.updateSettings);

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockWorkspaceId = 'test-workspace-123';

const mockSettingsNotGranted: BiometricSettingsResponse = {
  workspace_id: mockWorkspaceId,
  face_detection_enabled: false,
  consent_status: 'not_granted',
  consent_granted_at: null,
  public_face_search_enabled: false,
  auto_clustering_enabled: false,
  ai_processing_consent: false,
};

const mockSettingsGranted: BiometricSettingsResponse = {
  workspace_id: mockWorkspaceId,
  face_detection_enabled: true,
  consent_status: 'granted',
  consent_granted_at: '2024-01-15T10:30:00Z',
  public_face_search_enabled: true,
  auto_clustering_enabled: true,
  ai_processing_consent: false,
};

const mockSettingsWithdrawn: BiometricSettingsResponse = {
  workspace_id: mockWorkspaceId,
  face_detection_enabled: false,
  consent_status: 'withdrawn',
  consent_granted_at: null,
  public_face_search_enabled: false,
  auto_clustering_enabled: false,
  ai_processing_consent: false,
};

const mockSettingsPendingDeletion: BiometricSettingsResponse = {
  workspace_id: mockWorkspaceId,
  face_detection_enabled: false,
  consent_status: 'pending_deletion',
  consent_granted_at: null,
  public_face_search_enabled: false,
  auto_clustering_enabled: false,
  ai_processing_consent: false,
};

const mockHistoryEntry: ConsentHistoryEntry = {
  id: 'history-1',
  workspace_id: mockWorkspaceId,
  action: 'grant',
  performed_by_user_id: 'user-123',
  performed_at: '2024-01-15T10:30:00Z',
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0',
  policy_version: '1.0',
  reason: null,
  details: null,
};

const mockHistoryResponse: ConsentHistoryResponse = {
  items: [mockHistoryEntry],
  total: 1,
  page: 1,
  page_size: 10,
};

const emptyHistoryResponse: ConsentHistoryResponse = {
  items: [],
  total: 0,
  page: 1,
  page_size: 10,
};

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const renderPanel = (workspaceId = mockWorkspaceId) => {
  return render(<BiometricSettingsPanel workspaceId={workspaceId} />);
};

describe('BiometricSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful responses
    mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
    mockGetHistory.mockResolvedValue(emptyHistoryResponse);
  });

  // ---------------------------------------------------------------------------
  // Loading State Tests
  // ---------------------------------------------------------------------------

  describe('Loading State', () => {
    it('shows loading spinner while fetching settings', async () => {
      mockGetSettings.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSettingsGranted), 100))
      );

      renderPanel();

      // Should show loading spinner
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Biometric & Face Detection')).toBeInTheDocument();
      });
    });

    it('shows error message when settings fetch fails', async () => {
      mockGetSettings.mockRejectedValue(new Error('Network error'));

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Failed to load biometric settings')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Consent Status Display Tests
  // ---------------------------------------------------------------------------

  describe('Consent Status Display', () => {
    it('shows "Consent Not Granted" status when consent is not granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent Not Granted')).toBeInTheDocument();
        expect(
          screen.getByText(/Face detection is disabled. Grant consent to enable biometric features/i)
        ).toBeInTheDocument();
      });
    });

    it('shows "Consent Granted" status when consent is granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        // Use getAllByText since there are multiple elements with same text (heading + badge)
        const consentGrantedElements = screen.getAllByText('Consent Granted');
        expect(consentGrantedElements.length).toBeGreaterThan(0);
        expect(
          screen.getByText(/Face detection is enabled. Biometric data processing is active/i)
        ).toBeInTheDocument();
      });
    });

    it('shows "Consent Withdrawn" status when consent is withdrawn', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsWithdrawn);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent Withdrawn')).toBeInTheDocument();
        expect(
          screen.getByText(/Face detection is disabled. You can re-grant consent at any time/i)
        ).toBeInTheDocument();
      });
    });

    it('shows "Pending Deletion" status when data deletion is in progress', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsPendingDeletion);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Pending Deletion')).toBeInTheDocument();
        expect(
          screen.getByText(/Biometric data is being deleted. This process may take some time/i)
        ).toBeInTheDocument();
      });
    });

    it('shows consent granted date when consent is granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        // Date should be displayed
        expect(screen.getByText(/Granted on/i)).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Grant Consent Button Tests
  // ---------------------------------------------------------------------------

  describe('Grant Consent Button', () => {
    it('shows "Grant Consent" button when consent is not granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });
    });

    it('shows "Grant Consent" button when consent is withdrawn', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsWithdrawn);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });
    });

    it('hides "Grant Consent" button when consent is granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        const consentGrantedElements = screen.getAllByText('Consent Granted');
        expect(consentGrantedElements.length).toBeGreaterThan(0);
      });

      // Grant button should not be visible, but Withdraw button should
      expect(screen.queryByRole('button', { name: /^Grant Consent$/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
    });

    it('disables button when status is pending_deletion', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsPendingDeletion);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Pending Deletion')).toBeInTheDocument();
      });

      // No grant or withdraw buttons should be present during pending deletion
      expect(screen.queryByRole('button', { name: /Grant Consent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Withdraw Consent/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Grant Consent Modal Tests
  // ---------------------------------------------------------------------------

  describe('Grant Consent Modal', () => {
    it('opens modal when clicking "Grant Consent" button', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      expect(screen.getByText('Grant Biometric Consent')).toBeInTheDocument();
      expect(
        screen.getByText(/Face detection will analyze photos in your workspace/i)
      ).toBeInTheDocument();
    });

    it('shows GDPR compliance information in modal', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      expect(
        screen.getByText(/This complies with GDPR Article 9 requirements/i)
      ).toBeInTheDocument();
    });

    it('closes modal when clicking Cancel', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));
      expect(screen.getByText('Grant Biometric Consent')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      await waitFor(() => {
        expect(screen.queryByText('Grant Biometric Consent')).not.toBeInTheDocument();
      });
    });

    it('calls grantConsent API when confirming', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
      mockGrantConsent.mockResolvedValue({
        success: true,
        message: 'Consent granted',
        settings: mockSettingsGranted,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      // Click the Grant Consent button in modal (second one)
      const modalButtons = screen.getAllByRole('button', { name: /Grant Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        expect(mockGrantConsent).toHaveBeenCalledWith(mockWorkspaceId, {
          policy_version: '1.0',
        });
      });
    });

    it('shows loading state while granting consent', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
      mockGrantConsent.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  message: 'Consent granted',
                  settings: mockSettingsGranted,
                }),
              100
            )
          )
      );

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      const modalButtons = screen.getAllByRole('button', { name: /Grant Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      // Should show loading spinner - the spinner is inside the confirm button
      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /Grant Consent/i });
        // Find the button in the modal (last one) and check it contains the spinner
        const confirmButton = buttons[buttons.length - 1];
        expect(confirmButton.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows error when grant fails', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
      mockGrantConsent.mockRejectedValue(new Error('Server error'));

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      const modalButtons = screen.getAllByRole('button', { name: /Grant Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText('Failed to grant consent')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Withdraw Consent Modal Tests
  // ---------------------------------------------------------------------------

  describe('Withdraw Consent Modal', () => {
    it('opens modal when clicking "Withdraw Consent" button', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      expect(screen.getByText('Withdraw Biometric Consent')).toBeInTheDocument();
    });

    it('shows cascade delete checkbox in withdraw modal', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      expect(screen.getByText('Delete all biometric data')).toBeInTheDocument();
      expect(
        screen.getByText(/This will permanently delete all face embeddings and clusters/i)
      ).toBeInTheDocument();
    });

    it('allows entering reason for withdrawal', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      const reasonInput = screen.getByPlaceholderText(/Why are you withdrawing consent/i);
      await user.type(reasonInput, 'Privacy concerns');

      expect(reasonInput).toHaveValue('Privacy concerns');
    });

    it('calls withdrawConsent API with cascade_delete=false when unchecked', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockWithdrawConsent.mockResolvedValue({
        success: true,
        message: 'Consent withdrawn',
        settings: mockSettingsWithdrawn,
        deletion_job_scheduled: false,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      // Click the Withdraw Consent button in modal
      const modalButtons = screen.getAllByRole('button', { name: /Withdraw Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        expect(mockWithdrawConsent).toHaveBeenCalledWith(
          mockWorkspaceId,
          { reason: undefined },
          false
        );
      });
    });

    it('calls withdrawConsent API with cascade_delete=true when checked', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockWithdrawConsent.mockResolvedValue({
        success: true,
        message: 'Consent withdrawn',
        settings: mockSettingsPendingDeletion,
        deletion_job_scheduled: true,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      // Check the cascade delete checkbox
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const reasonInput = screen.getByPlaceholderText(/Why are you withdrawing consent/i);
      await user.type(reasonInput, 'GDPR request');

      // Click the Withdraw Consent button in modal
      const modalButtons = screen.getAllByRole('button', { name: /Withdraw Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        expect(mockWithdrawConsent).toHaveBeenCalledWith(
          mockWorkspaceId,
          { reason: 'GDPR request' },
          true
        );
      });
    });

    it('closes modal and resets state when clicking Cancel', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      // Type a reason and check cascade delete
      const reasonInput = screen.getByPlaceholderText(/Why are you withdrawing consent/i);
      await user.type(reasonInput, 'Test reason');
      await user.click(screen.getByRole('checkbox'));

      // Cancel
      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      await waitFor(() => {
        expect(screen.queryByText('Withdraw Biometric Consent')).not.toBeInTheDocument();
      });

      // Re-open modal, state should be reset
      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));

      const newReasonInput = screen.getByPlaceholderText(/Why are you withdrawing consent/i);
      expect(newReasonInput).toHaveValue('');
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature Settings Toggle Tests
  // ---------------------------------------------------------------------------

  describe('Feature Settings Toggles', () => {
    it('shows feature toggles when consent is granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Face Detection Features')).toBeInTheDocument();
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
        expect(screen.getByText('Auto Face Clustering')).toBeInTheDocument();
        expect(screen.getByText('AI Processing Consent')).toBeInTheDocument();
      });
    });

    it('hides feature toggles when consent is not granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent Not Granted')).toBeInTheDocument();
      });

      expect(screen.queryByText('Face Detection Features')).not.toBeInTheDocument();
      expect(screen.queryByText('Public Face Search')).not.toBeInTheDocument();
    });

    it('calls updateSettings when toggling public face search', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockResolvedValue({
        ...mockSettingsGranted,
        public_face_search_enabled: false,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[0]); // Public Face Search toggle

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(mockWorkspaceId, {
          public_face_search_enabled: false,
        });
      });
    });

    it('calls updateSettings when toggling auto clustering', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockResolvedValue({
        ...mockSettingsGranted,
        auto_clustering_enabled: false,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Auto Face Clustering')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[1]); // Auto Face Clustering toggle

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(mockWorkspaceId, {
          auto_clustering_enabled: false,
        });
      });
    });

    it('calls updateSettings when toggling AI processing consent', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockResolvedValue({
        ...mockSettingsGranted,
        ai_processing_consent: true,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('AI Processing Consent')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[2]); // AI Processing Consent toggle

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(mockWorkspaceId, {
          ai_processing_consent: true,
        });
      });
    });

    it('shows error when toggle update fails', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockRejectedValue(new Error('Update failed'));

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[0]);

      await waitFor(() => {
        expect(screen.getByText('Failed to update settings')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Consent History Tests
  // ---------------------------------------------------------------------------

  describe('Consent History', () => {
    it('shows consent history when entries exist', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent History')).toBeInTheDocument();
        const consentGrantedElements = screen.getAllByText('Consent Granted');
        expect(consentGrantedElements.length).toBeGreaterThan(0);
      });
    });

    it('hides consent history section when no entries exist', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(emptyHistoryResponse);

      renderPanel();

      await waitFor(() => {
        const consentGrantedElements = screen.getAllByText('Consent Granted');
        expect(consentGrantedElements.length).toBeGreaterThan(0);
      });

      // History section should not appear
      expect(screen.queryByText('Consent History')).not.toBeInTheDocument();
    });

    it('displays history entries with action labels', async () => {
      const multiHistory: ConsentHistoryResponse = {
        items: [
          { ...mockHistoryEntry, id: '1', action: 'grant' },
          {
            ...mockHistoryEntry,
            id: '2',
            action: 'withdraw',
            reason: 'Privacy concerns',
          },
          { ...mockHistoryEntry, id: '3', action: 'settings_update' },
        ],
        total: 3,
        page: 1,
        page_size: 10,
      };
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(multiHistory);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent History')).toBeInTheDocument();
      });

      // Different action types should show with their labels
      expect(screen.getAllByText(/Consent Granted/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Consent Withdrawn')).toBeInTheDocument();
      expect(screen.getByText('Settings Updated')).toBeInTheDocument();
    });

    it('shows reason for withdrawal entries', async () => {
      const historyWithReason: ConsentHistoryResponse = {
        items: [
          {
            ...mockHistoryEntry,
            action: 'withdraw',
            reason: 'GDPR deletion request',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      };
      mockGetSettings.mockResolvedValue(mockSettingsWithdrawn);
      mockGetHistory.mockResolvedValue(historyWithReason);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/GDPR deletion request/i)).toBeInTheDocument();
      });
    });

    it('refreshes history after granting consent', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
      mockGetHistory.mockResolvedValue(emptyHistoryResponse);
      mockGrantConsent.mockResolvedValue({
        success: true,
        message: 'Consent granted',
        settings: mockSettingsGranted,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      // Reset mock to return history after grant
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));
      const modalButtons = screen.getAllByRole('button', { name: /Grant Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        // History should be refetched after granting
        expect(mockGetHistory).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GDPR Information Display Tests
  // ---------------------------------------------------------------------------

  describe('GDPR Information Display', () => {
    it('shows GDPR Article 9 compliance information', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('GDPR Article 9 Compliance')).toBeInTheDocument();
        expect(
          screen.getByText(/Face data is considered biometric data under GDPR/i)
        ).toBeInTheDocument();
      });
    });

    it('shows link to biometric policy', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        const policyLink = screen.getByRole('link', { name: /Read our Biometric Data Policy/i });
        expect(policyLink).toHaveAttribute('href', '/legal/biometric-policy');
        expect(policyLink).toHaveAttribute('target', '_blank');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility Tests
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('has correct ARIA attributes on toggles', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');

      toggles.forEach((toggle) => {
        expect(toggle).toHaveAttribute('aria-checked');
        expect(toggle).toHaveAttribute('aria-label');
      });
    });

    it('reflects enabled state in aria-checked', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');

      // public_face_search_enabled = true
      expect(toggles[0]).toHaveAttribute('aria-checked', 'true');
      // auto_clustering_enabled = true
      expect(toggles[1]).toHaveAttribute('aria-checked', 'true');
      // ai_processing_consent = false
      expect(toggles[2]).toHaveAttribute('aria-checked', 'false');
    });

    it('supports keyboard navigation for toggles', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockResolvedValue({
        ...mockSettingsGranted,
        public_face_search_enabled: false,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      toggles[0].focus();

      await user.keyboard('[Space]');

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalled();
      });
    });

    it('has accessible modal dialogs', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));

      // Modal should be accessible
      expect(screen.getByText('Grant Biometric Consent')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('shows error banner when error occurs', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockRejectedValue(new Error('Update failed'));

      const user = userEvent.setup();
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[0]);

      await waitFor(() => {
        expect(screen.getByText('Failed to update settings')).toBeInTheDocument();
      });
    });

    it('allows dismissing error banner', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockUpdateSettings.mockRejectedValue(new Error('Update failed'));

      const user = userEvent.setup();
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Public Face Search')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      await user.click(toggles[0]);

      await waitFor(() => {
        expect(screen.getByText('Failed to update settings')).toBeInTheDocument();
      });

      // Find and click the dismiss button (XCircle icon)
      const errorBanner = screen.getByText('Failed to update settings').closest('div');
      const dismissButton = within(errorBanner!).getByRole('button');
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Failed to update settings')).not.toBeInTheDocument();
      });
    });

    it('handles history fetch error gracefully', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockRejectedValue(new Error('History fetch failed'));

      renderPanel();

      await waitFor(() => {
        const consentGrantedElements = screen.getAllByText('Consent Granted');
        expect(consentGrantedElements.length).toBeGreaterThan(0);
      });

      // Panel should still render without history
      expect(screen.queryByText('Consent History')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases Tests
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles empty workspaceId gracefully', async () => {
      renderPanel('');

      // Should not crash
      await waitFor(() => {
        expect(mockGetSettings).not.toHaveBeenCalled();
      });
    });

    it('prevents toggle actions when consent is not granted', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Consent Not Granted')).toBeInTheDocument();
      });

      // Toggle section should not exist
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('disables all interactions during pending_deletion', async () => {
      mockGetSettings.mockResolvedValue(mockSettingsPendingDeletion);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Pending Deletion')).toBeInTheDocument();
      });

      // No action buttons should be available
      expect(screen.queryByRole('button', { name: /Grant Consent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Withdraw Consent/i })).not.toBeInTheDocument();
    });

    it('updates state after successful consent grant', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsNotGranted);
      mockGrantConsent.mockResolvedValue({
        success: true,
        message: 'Consent granted',
        settings: mockSettingsGranted,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Grant Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Grant Consent/i }));
      const modalButtons = screen.getAllByRole('button', { name: /Grant Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        // Status should update to granted
        expect(screen.getByText('Face Detection Features')).toBeInTheDocument();
      });
    });

    it('updates state after successful consent withdrawal', async () => {
      const user = userEvent.setup();
      mockGetSettings.mockResolvedValue(mockSettingsGranted);
      mockGetHistory.mockResolvedValue(mockHistoryResponse);
      mockWithdrawConsent.mockResolvedValue({
        success: true,
        message: 'Consent withdrawn',
        settings: mockSettingsWithdrawn,
        deletion_job_scheduled: false,
      });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Withdraw Consent/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Withdraw Consent/i }));
      const modalButtons = screen.getAllByRole('button', { name: /Withdraw Consent/i });
      await user.click(modalButtons[modalButtons.length - 1]);

      await waitFor(() => {
        // Status should update to withdrawn
        expect(screen.getByText('Consent Withdrawn')).toBeInTheDocument();
        // Feature toggles should be hidden
        expect(screen.queryByText('Face Detection Features')).not.toBeInTheDocument();
      });
    });
  });
});
