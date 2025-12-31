/**
 * InvitationCreatePage: Wizard host for creating digital invitations
 *
 * Multi-step wizard flow:
 * 1. Event Details - title, date, venue
 * 2. Template Selection - choose and customize template
 * 3. Media & Preview - upload images and preview
 *
 * Features:
 * - Auto-save drafts every 30 seconds
 * - Manual save draft button
 * - Resume from draft via URL param
 *
 * Feature: 016-save-the-date
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Save, Cloud, CloudOff, Loader2 } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { InvitationWizard } from '@/components/features/invitations/InvitationWizard';
import { invitationService } from '@/services/invitationService';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/hooks/useToast';
import { useInvitationDraft, type DraftSaveStatus } from '@/hooks/useInvitationDraft';
import type { CreateInvitationRequest } from '@/types/invitations';

interface WizardData {
  // Step 1: Event Details
  title: string;
  description?: string;
  event_type: string;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone: string;
  venue: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    map_url?: string;
  };
  host_names: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  primary_language: string;
  secondary_language?: string;

  // Step 2: Template
  template_id?: string;
  customization: Record<string, unknown>;

  // Step 3: RSVP Settings
  rsvp_settings: {
    enabled: boolean;
    deadline?: string;
    max_party_size: number;
    collect_dietary: boolean;
    collect_phone: boolean;
    custom_questions: Array<{
      question: string;
      type: 'text' | 'select' | 'checkbox';
      options?: string[];
      required: boolean;
    }>;
  };
}

const INITIAL_DATA: WizardData = {
  title: '',
  event_type: 'wedding',
  event_datetime: '',
  event_timezone: 'Asia/Kolkata',
  venue: {
    country: 'India',
  },
  host_names: [],
  primary_language: 'en',
  customization: {},
  rsvp_settings: {
    enabled: true,
    max_party_size: 4,
    collect_dietary: true,
    collect_phone: false,
    custom_questions: [],
  },
};

/**
 * Auto-save status indicator component.
 */
const AutoSaveIndicator: React.FC<{
  status: DraftSaveStatus;
  lastSavedText: string;
}> = ({ status, lastSavedText }) => {
  const getStatusContent = () => {
    switch (status) {
      case 'saving':
        return (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary" />
            <span className="text-text-tertiary">Saving...</span>
          </>
        );
      case 'saved':
        return (
          <>
            <Cloud className="w-3.5 h-3.5 text-success" />
            <span className="text-success">Saved</span>
          </>
        );
      case 'error':
        return (
          <>
            <CloudOff className="w-3.5 h-3.5 text-error" />
            <span className="text-error">Save failed</span>
          </>
        );
      default:
        if (lastSavedText) {
          return (
            <>
              <Cloud className="w-3.5 h-3.5 text-text-tertiary" />
              <span className="text-text-tertiary">Saved {lastSavedText}</span>
            </>
          );
        }
        return null;
    }
  };

  const content = getStatusContent();
  if (!content) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {content}
    </div>
  );
};

const InvitationCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [wizardData, setWizardData] = useState<WizardData>(INITIAL_DATA);
  const [currentStep, setCurrentStep] = useState(1);

  // ---------------------------------------------------------------------------
  // Draft auto-save hook (Phase 10)
  // ---------------------------------------------------------------------------

  const {
    draftId,
    saveStatus,
    isLoadingDraft,
    saveDraft,
    triggerAutoSave,
    clearDraft,
    getLastSavedText,
  } = useInvitationDraft({
    workspaceId,
    autoSaveEnabled: true,
    autoSaveInterval: 30000, // 30 seconds
    onDraftLoaded: (data) => {
      // Restore wizard state from draft
      setWizardData((prev) => ({
        ...prev,
        ...(data as Partial<WizardData>),
      }));
      // Restore step if saved
      if (typeof data.currentStep === 'number') {
        setCurrentStep(data.currentStep);
      }
    },
    onSaveError: () => {
      // Silent - indicator shows error state
    },
  });

  // Trigger auto-save when data changes
  useEffect(() => {
    // Don't auto-save if loading draft or no meaningful data
    if (isLoadingDraft || !wizardData.title) return;

    triggerAutoSave({
      ...wizardData,
      currentStep,
    });
  }, [wizardData, currentStep, triggerAutoSave, isLoadingDraft]);

  // Manual save handler
  const handleManualSave = useCallback(async () => {
    await saveDraft({
      ...wizardData,
      currentStep,
    });
    showToast('Draft saved', 'success');
  }, [wizardData, currentStep, saveDraft, showToast]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: WizardData) => {
      if (!workspaceId) throw new Error('No workspace selected');

      const request: CreateInvitationRequest = {
        title: data.title,
        description: data.description,
        event_type: data.event_type as CreateInvitationRequest['event_type'],
        event_datetime: data.event_datetime,
        event_end_datetime: data.event_end_datetime,
        event_timezone: data.event_timezone,
        venue: data.venue,
        host_names: data.host_names,
        host_contact_phone: data.host_contact_phone,
        host_contact_email: data.host_contact_email,
        rsvp_settings: data.rsvp_settings,
        primary_language: data.primary_language,
        secondary_language: data.secondary_language,
        template_id: data.template_id,
        customization: data.customization,
      };

      return invitationService.createInvitation(workspaceId, request);
    },
    onSuccess: async (response) => {
      // Clear the draft after successful creation
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation created successfully!', 'success');
      navigate(`/workspace/invitations/${response.invitation_id}`);
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to create invitation', 'error');
    },
  });

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/workspace/invitations');
    }
  };

  const handleNext = useCallback((stepData: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...stepData }));
    setCurrentStep((prev) => prev + 1);
  }, []);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleComplete = useCallback(
    (finalData: Partial<WizardData>) => {
      const completeData = { ...wizardData, ...finalData };
      setWizardData(completeData);
      createMutation.mutate(completeData);
    },
    [wizardData, createMutation]
  );

  const handleDataChange = useCallback((data: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }));
  }, []);

  // Show loading state while loading draft
  if (isLoadingDraft) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-text-secondary">Loading draft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AppButton
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </AppButton>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                Create Invitation
              </h1>
              <p className="text-sm text-text-secondary">
                Step {currentStep} of 3
              </p>
            </div>
          </div>

          {/* Right side: Auto-save indicator + Save button + Progress */}
          <div className="flex items-center gap-4">
            {/* Auto-save indicator */}
            <AutoSaveIndicator
              status={saveStatus}
              lastSavedText={getLastSavedText()}
            />

            {/* Manual save button */}
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleManualSave}
              disabled={saveStatus === 'saving' || !wizardData.title}
              className="hidden sm:flex"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Save Draft
            </AppButton>

            {/* Progress indicator */}
            <div className="hidden md:flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      step < currentStep
                        ? 'bg-success text-white'
                        : step === currentStep
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-text-tertiary'
                    }`}
                  >
                    {step < currentStep ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      step
                    )}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-12 h-0.5 ${
                        step < currentStep ? 'bg-success' : 'bg-surface-hover'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Wizard content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <InvitationWizard
          workspaceId={workspaceId!}
          currentStep={currentStep}
          data={wizardData}
          onNext={handleNext}
          onStepChange={handleStepChange}
          onComplete={handleComplete}
          onDataChange={handleDataChange}
          isSubmitting={createMutation.isPending}
        />
      </div>
    </div>
  );
};

export default InvitationCreatePage;
