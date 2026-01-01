/**
 * SubEventEditor: Form for creating/editing a sub-event
 *
 * Used within the InvitationWizard or InvitationEditor to manage
 * multiple ceremonies/functions for an invitation.
 *
 * Feature: 016-save-the-date Phase 8
 */

import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Clock } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput, AppTextarea } from '@/components/ui/AppInput';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Toggle, Select } from '@/components/ui/FormControls';
import { DateTimePicker } from '@/components/invitations/DateTimePicker';
import type { SubEvent } from '@/types/invitations';

interface SubEventEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<SubEvent>) => Promise<void>;
  subEvent?: SubEvent | null;
  isLoading?: boolean;
}

const EVENT_TYPES = [
  { value: '', label: 'Select type...' },
  { value: 'mehndi', label: 'Mehndi' },
  { value: 'sangeet', label: 'Sangeet' },
  { value: 'haldi', label: 'Haldi' },
  { value: 'wedding', label: 'Wedding Ceremony' },
  { value: 'reception', label: 'Reception' },
  { value: 'cocktail', label: 'Cocktail Party' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'rehearsal', label: 'Rehearsal Dinner' },
  { value: 'other', label: 'Other' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
];

export const SubEventEditor: React.FC<SubEventEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  subEvent,
  isLoading = false,
}) => {
  const isEditing = !!subEvent;

  const [formData, setFormData] = useState<Partial<SubEvent>>({
    name: '',
    event_type: '',
    event_datetime: new Date().toISOString(),
    event_end_datetime: undefined,
    event_timezone: 'Asia/Kolkata',
    description: '',
    venue_name: '',
    venue_address: '',
    venue_city: '',
    venue_map_url: '',
    show_countdown: true,
    enable_individual_rsvp: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (subEvent) {
      setFormData({
        name: subEvent.name,
        event_type: subEvent.event_type || '',
        event_datetime: subEvent.event_datetime,
        event_end_datetime: subEvent.event_end_datetime,
        event_timezone: subEvent.event_timezone,
        description: subEvent.description || '',
        venue_name: subEvent.venue_name || '',
        venue_address: subEvent.venue_address || '',
        venue_city: subEvent.venue_city || '',
        venue_map_url: subEvent.venue_map_url || '',
        show_countdown: subEvent.show_countdown,
        enable_individual_rsvp: subEvent.enable_individual_rsvp,
      });
    } else {
      // Reset for new sub-event
      setFormData({
        name: '',
        event_type: '',
        event_datetime: new Date().toISOString(),
        event_end_datetime: undefined,
        event_timezone: 'Asia/Kolkata',
        description: '',
        venue_name: '',
        venue_address: '',
        venue_city: '',
        venue_map_url: '',
        show_countdown: true,
        enable_individual_rsvp: false,
      });
    }
  }, [subEvent, isOpen]);

  const handleChange = (field: keyof SubEvent, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name?.trim()) return;

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save sub-event:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">
            {isEditing ? 'Edit Event' : 'Add Event'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <AppInput
            label="Event Name"
            placeholder="e.g., Sangeet Night"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            isRequired
          />

          <Select
            label="Event Type"
            options={EVENT_TYPES}
            value={formData.event_type || ''}
            onChange={(e) => handleChange('event_type', e.target.value)}
          />

          <AppTextarea
            label="Description (Optional)"
            placeholder="Brief description of this event..."
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={2}
          />
        </div>

        {/* Date & Time */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Date & Time
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateTimePicker
              label="Start Date & Time"
              value={formData.event_datetime || ''}
              onChange={(val) => handleChange('event_datetime', val)}
            />
            <DateTimePicker
              label="End Date & Time (Optional)"
              value={formData.event_end_datetime || ''}
              onChange={(val) => handleChange('event_end_datetime', val)}
            />
          </div>

          <Select
            label="Timezone"
            options={TIMEZONES}
            value={formData.event_timezone || 'Asia/Kolkata'}
            onChange={(e) => handleChange('event_timezone', e.target.value)}
          />
        </div>

        {/* Venue */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Venue
          </h3>

          <AppInput
            label="Venue Name"
            placeholder="e.g., Grand Ballroom, Hotel Taj"
            value={formData.venue_name || ''}
            onChange={(e) => handleChange('venue_name', e.target.value)}
          />

          <AppInput
            label="Address"
            placeholder="Street address..."
            value={formData.venue_address || ''}
            onChange={(e) => handleChange('venue_address', e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AppInput
              label="City"
              placeholder="e.g., Mumbai"
              value={formData.venue_city || ''}
              onChange={(e) => handleChange('venue_city', e.target.value)}
            />
            <AppInput
              label="Map URL (Optional)"
              placeholder="https://maps.google.com/..."
              value={formData.venue_map_url || ''}
              onChange={(e) => handleChange('venue_map_url', e.target.value)}
            />
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            label="Show Countdown"
            description="Display a countdown timer for this event"
            checked={formData.show_countdown}
            onChange={(e) => handleChange('show_countdown', e.target.checked)}
          />
          <Toggle
            label="Enable Individual RSVP"
            description="Allow guests to RSVP separately for this event"
            checked={formData.enable_individual_rsvp}
            onChange={(e) => handleChange('enable_individual_rsvp', e.target.checked)}
          />
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={!formData.name?.trim()}
          >
            {isEditing ? 'Save Changes' : 'Add Event'}
          </AppButton>
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default SubEventEditor;
