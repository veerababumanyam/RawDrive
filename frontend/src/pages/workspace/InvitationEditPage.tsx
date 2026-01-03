/**
 * InvitationEditPage: Edit an existing digital invitation
 *
 * Reuses InvitationWizard with pre-filled data.
 * Features live preview panel with mobile/desktop toggle.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Eye, EyeOff } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { InvitationWizard, type WizardData } from '@/components/features/invitations/InvitationWizard';
import { InvitationPreview } from '@/components/features/invitations/InvitationPreview';
import { invitationService } from '@/services/invitationService';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/hooks/useToast';
import type { UpdateInvitationRequest, Invitation } from '@/types/invitations';

const InvitationEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [showPreview, setShowPreview] = useState(true);

  // Fetch invitation details
  const { data: invitation, isLoading } = useQuery({
    queryKey: ['invitation', workspaceId, id],
    queryFn: () => invitationService.getInvitation(workspaceId!, id!),
    enabled: !!id && !!workspaceId,
  });

  // Map invitation to wizard data
  useEffect(() => {
    if (invitation) {
      setWizardData({
        title: invitation.title,
        description: invitation.description,
        event_type: invitation.event_type,
        event_datetime: invitation.event_datetime,
        event_end_datetime: invitation.event_end_datetime,
        event_timezone: invitation.event_timezone,
        venue: invitation.venue,
        host_names: invitation.host_names,
        host_contact_phone: invitation.host_contact_phone,
        host_contact_email: invitation.host_contact_email,
        primary_language: invitation.primary_language,
        secondary_language: invitation.secondary_language,
        template_id: invitation.template_id,
        customization: invitation.customization,
        font_heading: invitation.font_heading,
        font_body: invitation.font_body,
        layout_density: invitation.layout_density as WizardData['layout_density'],
        rsvp_settings: invitation.rsvp_settings,
        video_url: invitation.video_url,
        audio_url: invitation.audio_url,
      });
    }
  }, [invitation]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: WizardData) => {
      if (!workspaceId || !id) throw new Error('Missing ID');

      const request: UpdateInvitationRequest = {
        title: data.title,
        description: data.description,
        event_type: data.event_type as UpdateInvitationRequest['event_type'],
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
        font_heading: data.font_heading,
        font_body: data.font_body,
        layout_density: data.layout_density,
      };

      return invitationService.updateInvitation(workspaceId, id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitation', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] });
      showToast('Invitation updated successfully!', 'success');
      navigate(`/workspace/invitations/${id}`);
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to update invitation', 'error');
    },
  });

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(`/workspace/invitations/${id}`);
    }
  };

  const handleNext = useCallback((stepData: Partial<WizardData>) => {
    setWizardData((prev) => (prev ? { ...prev, ...stepData } : null));
    setCurrentStep((prev) => prev + 1);
  }, []);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleComplete = useCallback(
    (finalData: Partial<WizardData>) => {
      if (!wizardData) return;
      const completeData = { ...wizardData, ...finalData };
      setWizardData(completeData);
      updateMutation.mutate(completeData);
    },
    [wizardData, updateMutation]
  );

  const handleDataChange = useCallback((data: Partial<WizardData>) => {
    setWizardData((prev) => (prev ? { ...prev, ...data } : null));
  }, []);

  if (isLoading || !wizardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between">
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
                Edit Invitation
              </h1>
              <p className="text-sm text-text-secondary">
                Step {currentStep} of 3
              </p>
            </div>
          </div>

          {/* Right side: Preview toggle */}
          <div className="flex items-center gap-4">
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="hidden lg:flex"
            >
              {showPreview ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1.5" />
                  Hide Preview
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1.5" />
                  Show Preview
                </>
              )}
            </AppButton>
          </div>
        </div>
      </div>

      {/* Main Content - Two column layout on large screens */}
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <div className={`grid gap-8 ${showPreview ? 'lg:grid-cols-[1fr,400px]' : ''}`}>
          {/* Wizard content */}
          <div>
            <InvitationWizard
              workspaceId={workspaceId!}
              currentStep={currentStep}
              data={wizardData}
              onNext={handleNext}
              onStepChange={handleStepChange}
              onComplete={handleComplete}
              onDataChange={handleDataChange}
              isSubmitting={updateMutation.isPending}
            />
          </div>

          {/* Live Preview Panel */}
          {showPreview && (
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Live Preview
                </h2>
                <InvitationPreview
                  title={wizardData.title || 'Your Event Title'}
                  description={wizardData.description}
                  eventType={wizardData.event_type}
                  eventDatetime={wizardData.event_datetime}
                  eventEndDatetime={wizardData.event_end_datetime}
                  timezone={wizardData.event_timezone}
                  venue={wizardData.venue}
                  hostNames={wizardData.host_names}
                  videoUrl={wizardData.video_url}
                  audioUrl={wizardData.audio_url}
                  customization={{
                    colors: wizardData.customization?.colors as Record<string, string> | undefined,
                    fonts: Object.fromEntries(
                      Object.entries({
                        heading: wizardData.font_heading,
                        body: wizardData.font_body,
                      }).filter(([_, v]) => v !== undefined)
                    ) as Record<string, string>,
                  }}
                  rsvpSettings={wizardData.rsvp_settings}
                  viewMode={previewMode}
                  onViewModeChange={setPreviewMode}
                  compact
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvitationEditPage;

