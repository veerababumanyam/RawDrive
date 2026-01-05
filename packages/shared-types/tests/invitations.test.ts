import { describe, it, expect } from 'vitest';
import {
  // Core enums
  InvitationStatus,
  RSVPStatus,
  EventType,
  TemplateCategory,
  GuestStatus,
  // Media enums
  MediaType,
  MediaPurpose,
  MediaProcessingStatus,
  // Layout enums
  LayoutMode,
  LayoutDensity,
  // Source & verification enums
  RSVPSource,
  CheckinVerificationMethod,
  DeviceType,
  ReferrerType,
  // AI generation enums
  AIGenerationType,
  AIGenerationStatus,
  ImageGenerationProvider,
  // Notification & event enums
  NotificationPreference,
  InvitationEventType,
  ActorType,
  RSVPQuestionType,
} from '../src/invitations';

import type {
  // Interfaces
  LayoutConfig,
  TemplateLayout,
  VenueInfo,
  RSVPCustomQuestion,
  RSVPSettings,
  MediaVariant,
  SubEvent,
  CreateSubEventRequest,
  UpdateSubEventRequest,
  InvitationMedia,
  UploadMediaRequest,
  UploadMediaResponse,
  InvitationTemplate,
  InvitationGuest,
  AddGuestRequest,
  UpdateGuestRequest,
  BulkAddGuestsRequest,
  InvitationRSVP,
  SubmitRSVPRequest,
  InvitationCheckin,
  CheckinRequest,
  InvitationViewAnalytics,
  RSVPStats,
  CheckinStats,
  InvitationStats,
  InvitationAIGeneration,
  ImageGenerationSettings,
  InvitationEvent,
} from '../src/invitations';

// Expected values for core enums
const invitationStatuses = ['draft', 'published', 'archived', 'expired', 'cancelled', 'deleted'];
const rsvpStatuses = ['pending', 'attending', 'not_attending', 'maybe'];
const eventTypes = ['wedding', 'birthday', 'anniversary', 'baby_shower', 'engagement', 'festival', 'corporate', 'other'];
const templateCategories = ['wedding', 'engagement', 'birthday', 'baby_shower', 'corporate', 'religious', 'anniversary', 'festival', 'other'];
const guestStatuses = ['invited', 'viewed', 'responded', 'checked_in'];

// Expected values for media enums
const mediaTypes = ['video', 'audio', 'image'];
const mediaPurposes = ['content', 'background', 'effect', 'main_card', 'cover', 'gallery', 'logo', 'pattern'];
const mediaProcessingStatuses = ['pending', 'processing', 'completed', 'failed'];

// Expected values for layout enums
const layoutModes = ['standard', 'card_only', 'hybrid'];
const layoutDensities = ['compact', 'normal', 'spacious'];

// Expected values for source & verification enums
const rsvpSources = ['web', 'qr_code', 'whatsapp', 'email_link', 'personal_link'];
const checkinVerificationMethods = ['qr_scan', 'manual', 'name_lookup', 'token'];
const deviceTypes = ['phone', 'tablet', 'desktop', 'unknown'];
const referrerTypes = ['direct', 'social', 'search', 'email', 'other'];

// Expected values for AI generation enums
const aiGenerationTypes = ['text', 'image'];
const aiGenerationStatuses = ['pending', 'completed', 'failed', 'timeout'];
const imageGenerationProviders = ['imagen', 'nano_banana', 'dalle', 'midjourney'];

// Expected values for notification & event enums
const notificationPreferences = ['immediate', 'daily_digest', 'disabled'];
const invitationEventTypes = ['created', 'updated', 'published', 'unpublished', 'archived', 'viewed', 'shared', 'rsvp_received', 'rsvp_updated', 'checkin', 'exported', 'deleted'];
const actorTypes = ['user', 'guest', 'system'];
const rsvpQuestionTypes = ['text', 'select', 'checkbox'];

describe('Invitation domain enums', () => {
  describe('Core enums', () => {
    it('InvitationStatus values match specification', () => {
      expect(Object.values(InvitationStatus)).toEqual(invitationStatuses);
    });

    it('RSVPStatus values match specification', () => {
      expect(Object.values(RSVPStatus)).toEqual(rsvpStatuses);
    });

    it('EventType values match specification', () => {
      expect(Object.values(EventType)).toEqual(eventTypes);
    });

    it('TemplateCategory values match specification', () => {
      expect(Object.values(TemplateCategory)).toEqual(templateCategories);
    });

    it('GuestStatus values match specification', () => {
      expect(Object.values(GuestStatus)).toEqual(guestStatuses);
    });
  });

  describe('Media enums', () => {
    it('MediaType values match specification', () => {
      expect(Object.values(MediaType)).toEqual(mediaTypes);
    });

    it('MediaPurpose values match specification', () => {
      expect(Object.values(MediaPurpose)).toEqual(mediaPurposes);
    });

    it('MediaProcessingStatus values match specification', () => {
      expect(Object.values(MediaProcessingStatus)).toEqual(mediaProcessingStatuses);
    });
  });

  describe('Layout enums', () => {
    it('LayoutMode values match specification', () => {
      expect(Object.values(LayoutMode)).toEqual(layoutModes);
    });

    it('LayoutDensity values match specification', () => {
      expect(Object.values(LayoutDensity)).toEqual(layoutDensities);
    });
  });

  describe('Source & verification enums', () => {
    it('RSVPSource values match specification', () => {
      expect(Object.values(RSVPSource)).toEqual(rsvpSources);
    });

    it('CheckinVerificationMethod values match specification', () => {
      expect(Object.values(CheckinVerificationMethod)).toEqual(checkinVerificationMethods);
    });

    it('DeviceType values match specification', () => {
      expect(Object.values(DeviceType)).toEqual(deviceTypes);
    });

    it('ReferrerType values match specification', () => {
      expect(Object.values(ReferrerType)).toEqual(referrerTypes);
    });
  });

  describe('AI generation enums', () => {
    it('AIGenerationType values match specification', () => {
      expect(Object.values(AIGenerationType)).toEqual(aiGenerationTypes);
    });

    it('AIGenerationStatus values match specification', () => {
      expect(Object.values(AIGenerationStatus)).toEqual(aiGenerationStatuses);
    });

    it('ImageGenerationProvider values match specification', () => {
      expect(Object.values(ImageGenerationProvider)).toEqual(imageGenerationProviders);
    });
  });

  describe('Notification & event enums', () => {
    it('NotificationPreference values match specification', () => {
      expect(Object.values(NotificationPreference)).toEqual(notificationPreferences);
    });

    it('InvitationEventType values match specification', () => {
      expect(Object.values(InvitationEventType)).toEqual(invitationEventTypes);
    });

    it('ActorType values match specification', () => {
      expect(Object.values(ActorType)).toEqual(actorTypes);
    });

    it('RSVPQuestionType values match specification', () => {
      expect(Object.values(RSVPQuestionType)).toEqual(rsvpQuestionTypes);
    });
  });
});

describe('Invitation interfaces type checking', () => {
  it('SubEvent interface has required properties', () => {
    const subEvent: SubEvent = {
      sub_event_id: 'test-id',
      invitation_id: 'inv-id',
      workspace_id: 'ws-id',
      name: 'Reception',
      event_datetime: '2026-01-15T18:00:00Z',
      event_timezone: 'Asia/Kolkata',
      display_order: 0,
      show_countdown: true,
      enable_individual_rsvp: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(subEvent.sub_event_id).toBe('test-id');
    expect(subEvent.name).toBe('Reception');
  });

  it('InvitationMedia interface has required properties', () => {
    const media: InvitationMedia = {
      media_id: 'media-id',
      invitation_id: 'inv-id',
      media_type: MediaType.VIDEO,
      purpose: MediaPurpose.CONTENT,
      processing_status: MediaProcessingStatus.COMPLETED,
      position: 0,
      autoplay: true,
      loop: false,
      muted: true,
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(media.media_id).toBe('media-id');
    expect(media.media_type).toBe('video');
    expect(media.processing_status).toBe('completed');
  });

  it('InvitationTemplate interface has required properties', () => {
    const template: InvitationTemplate = {
      template_id: 'tpl-id',
      workspace_id: null,
      name: 'Elegant Wedding',
      slug: 'elegant-wedding',
      category: TemplateCategory.WEDDING,
      tags: ['wedding', 'elegant'],
      layout: {
        sections: ['header', 'details', 'rsvp'],
        fonts: { heading: 'Playfair Display' },
        colors: { primary: '#000000' },
        positions: {},
        assets: {},
      },
      content_i18n: {},
      supported_languages: ['en'],
      is_active: true,
      is_premium: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(template.template_id).toBe('tpl-id');
    expect(template.category).toBe('wedding');
  });

  it('InvitationGuest interface has required properties', () => {
    const guest: InvitationGuest = {
      guest_id: 'guest-id',
      invitation_id: 'inv-id',
      name: 'John Doe',
      expected_party_size: 2,
      invitation_sent: false,
      invitation_viewed: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(guest.guest_id).toBe('guest-id');
    expect(guest.name).toBe('John Doe');
  });

  it('InvitationRSVP interface has required properties', () => {
    const rsvp: InvitationRSVP = {
      rsvp_id: 'rsvp-id',
      invitation_id: 'inv-id',
      workspace_id: 'ws-id',
      guest_name: 'Jane Doe',
      guest_email: 'jane@example.com',
      attending: true,
      party_size: 2,
      party_names: ['Jane Doe', 'John Doe'],
      custom_answers: {},
      source: RSVPSource.WEB,
      status: RSVPStatus.ATTENDING,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(rsvp.rsvp_id).toBe('rsvp-id');
    expect(rsvp.status).toBe('attending');
  });

  it('InvitationCheckin interface has required properties', () => {
    const checkin: InvitationCheckin = {
      checkin_id: 'checkin-id',
      invitation_id: 'inv-id',
      guest_name: 'John Doe',
      party_size_checked_in: 2,
      verification_method: CheckinVerificationMethod.QR_SCAN,
      checked_in_at: '2026-01-15T18:30:00Z',
    };
    expect(checkin.checkin_id).toBe('checkin-id');
    expect(checkin.verification_method).toBe('qr_scan');
  });

  it('InvitationViewAnalytics interface has required properties', () => {
    const analytics: InvitationViewAnalytics = {
      view_id: 'view-id',
      invitation_id: 'inv-id',
      device_type: DeviceType.PHONE,
      referrer_type: ReferrerType.SOCIAL,
      scrolled_to_rsvp: true,
      interacted_with_media: false,
      viewed_at: '2026-01-10T12:00:00Z',
    };
    expect(analytics.view_id).toBe('view-id');
    expect(analytics.device_type).toBe('phone');
  });

  it('InvitationAIGeneration interface has required properties', () => {
    const aiGen: InvitationAIGeneration = {
      generation_id: 'gen-id',
      invitation_id: 'inv-id',
      workspace_id: 'ws-id',
      user_id: 'user-id',
      generation_type: AIGenerationType.TEXT,
      prompt: 'Generate wedding invitation text',
      was_used: true,
      status: AIGenerationStatus.COMPLETED,
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(aiGen.generation_id).toBe('gen-id');
    expect(aiGen.generation_type).toBe('text');
  });

  it('InvitationEvent interface has required properties', () => {
    const event: InvitationEvent = {
      event_id: 'event-id',
      invitation_id: 'inv-id',
      workspace_id: 'ws-id',
      event_type: InvitationEventType.PUBLISHED,
      actor_type: ActorType.USER,
      event_data: {},
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(event.event_id).toBe('event-id');
    expect(event.event_type).toBe('published');
  });
});

describe('Helper interfaces', () => {
  it('VenueInfo interface works with partial data', () => {
    const venue: VenueInfo = {
      country: 'India',
      city: 'Mumbai',
    };
    expect(venue.country).toBe('India');
    expect(venue.city).toBe('Mumbai');
    expect(venue.name).toBeUndefined();
  });

  it('RSVPSettings interface has required properties', () => {
    const settings: RSVPSettings = {
      enabled: true,
      max_party_size: 5,
      collect_dietary: true,
      collect_phone: false,
      custom_questions: [],
    };
    expect(settings.enabled).toBe(true);
    expect(settings.max_party_size).toBe(5);
  });

  it('RSVPCustomQuestion interface works correctly', () => {
    const question: RSVPCustomQuestion = {
      question: 'Any dietary restrictions?',
      type: RSVPQuestionType.TEXT,
      required: false,
    };
    expect(question.question).toBe('Any dietary restrictions?');
    expect(question.type).toBe('text');
  });

  it('TemplateLayout interface has required properties', () => {
    const layout: TemplateLayout = {
      sections: ['header', 'body', 'footer'],
      fonts: { heading: 'Serif', body: 'Sans-serif' },
      colors: { primary: '#fff', secondary: '#000' },
      positions: {},
      assets: {},
    };
    expect(layout.sections).toHaveLength(3);
    expect(layout.fonts.heading).toBe('Serif');
  });

  it('RSVPStats interface has required properties', () => {
    const stats: RSVPStats = {
      total: 100,
      attending: 75,
      not_attending: 15,
      pending: 8,
      maybe: 2,
      total_party_size: 150,
    };
    expect(stats.total).toBe(100);
    expect(stats.attending).toBe(75);
  });

  it('CheckinStats interface has required properties', () => {
    const stats: CheckinStats = {
      total_checked_in: 50,
      total_party_size: 75,
    };
    expect(stats.total_checked_in).toBe(50);
  });
});
