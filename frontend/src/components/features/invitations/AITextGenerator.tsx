import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, Loader2, AlertCircle } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { Modal as AppModal } from '@/components/ui/Modal';
import { AppInput, AppTextarea } from '@/components/ui/AppInput';
import { Select } from '@/components/ui/FormControls';
import { useToast } from '@/hooks/useToast';
import { generateAIContent } from '@/services/invitationService';
import { GenerateContentRequest } from '@/types/invitations';

interface AITextGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (title: string, description: string) => void;
  workspaceId: string;
  initialEventType: string;
  initialLanguage?: string;
}

export const AITextGenerator: React.FC<AITextGeneratorProps> = ({
  isOpen,
  onClose,
  onApply,
  workspaceId,
  initialEventType,
  initialLanguage = 'English',
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  
  const [mood, setMood] = useState('Formal');
  const [tone, setTone] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [language, setLanguage] = useState(initialLanguage);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<{ title: string; description: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);

    try {
      const request: GenerateContentRequest = {
        event_type: initialEventType,
        mood,
        tone: tone || undefined,
        language,
        additional_details: additionalDetails || undefined,
      };

      const result = await generateAIContent(workspaceId, request);
      setGeneratedContent(result);
    } catch (err: any) {
      console.error('AI Generation failed:', err);
      // Detailed error handling based on backend codes
      if (err.message?.includes('AI_NOT_CONFIGURED')) {
         setError('Gemini API key is not configured. Please add it in your Settings > AI.');
      } else if (err.message?.includes('KEY_UNAUTHORIZED')) {
         setError('Gemini API key is invalid or unauthorized.');
      } else {
         setError(err.message || 'Failed to generate content. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedContent) {
      onApply(generatedContent.title, generatedContent.description);
      onClose();
    }
  };

  const moodOptions = [
    { value: 'Formal', label: 'Formal' },
    { value: 'Casual', label: 'Casual' },
    { value: 'Fun', label: 'Fun' },
    { value: 'Romantic', label: 'Romantic' },
    { value: 'Excited', label: 'Excited' },
    { value: 'Serious', label: 'Serious' },
  ];
  
  const languageOptions = [
    { value: 'English', label: 'English' },
    { value: 'Spanish', label: 'Spanish' },
    { value: 'French', label: 'French' },
    { value: 'German', label: 'German' },
    { value: 'Italian', label: 'Italian' },
    { value: 'Portuguese', label: 'Portuguese' },
    // Add more as needed
  ];

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title="Magic Write with AI"
      size="lg"
    >
      <div className="space-y-6">
        <div className="p-4 bg-primary-50 dark:bg-primary-900/10 rounded-lg text-sm text-text-secondary flex gap-3">
           <Wand2 className="w-5 h-5 text-primary flex-shrink-0" />
           <p>
             Generate catchy titles and warm descriptions for your {initialEventType} invitation. 
             Just tell us the mood and any extra details!
           </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
             label="Mood"
             value={mood}
             onChange={(e) => setMood(e.target.value)}
             options={moodOptions}
          />
          <Select
             label="Language"
             value={language}
             onChange={(e) => setLanguage(e.target.value)}
             options={languageOptions}
          />
        </div>
        
        <AppInput
           label="Tone (Optional)"
           placeholder="e.g., Witty, Poetic, Short & Sweet"
           value={tone}
           onChange={(e) => setTone(e.target.value)}
        />
        
        <AppTextarea
           label="Additional Details (Optional)"
           placeholder="e.g., Mention it is a surprise party, or dress code is black tie."
           value={additionalDetails}
           onChange={(e) => setAdditionalDetails(e.target.value)}
           rows={3}
        />

        {error && (
          <div className="p-3 bg-error-50 dark:bg-error-900/10 text-error-600 dark:text-error-400 text-sm rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <AppButton
            onClick={handleGenerate}
            isLoading={isGenerating}
            leftIcon={!isGenerating && <Wand2 className="w-4 h-4" />}
          >
            Generate Draft
          </AppButton>
        </div>

        {generatedContent && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-t border-border my-6"></div>
            <h3 className="text-sm font-medium text-text-secondary mb-4 uppercase tracking-wider">Generated Preview</h3>
            
            <AppCard className="bg-neutral-50 dark:bg-neutral-800/50 border-primary-100 dark:border-primary-900">
               <div className="space-y-4">
                  <div>
                    <span className="text-xs font-medium text-text-secondary">Title</span>
                    <p className="text-lg font-semibold font-heading text-primary">{generatedContent.title}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-text-secondary">Description</span>
                    <p className="text-text-secondary whitespace-pre-wrap">{generatedContent.description}</p>
                  </div>
               </div>
            </AppCard>
            
            <div className="mt-6 flex justify-end gap-3">
              <AppButton variant="ghost" onClick={() => setGeneratedContent(null)}>
                Discard
              </AppButton>
              <AppButton variant="primary" onClick={handleApply}>
                Apply to Invitation
              </AppButton>
            </div>
          </div>
        )}
      </div>
    </AppModal>
  );
};
