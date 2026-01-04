/**
 * Status of a digital invitation
 * Aligns with spec (draft, published, archived) while keeping legacy states for compatibility.
 */
export const InvitationStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
} as const;
export type InvitationStatus = typeof InvitationStatus[keyof typeof InvitationStatus];

/**
 * RSVP response status from a guest
 */
export const RSVPStatus = {
  PENDING: 'pending',
  ATTENDING: 'attending',
  NOT_ATTENDING: 'not_attending',
  MAYBE: 'maybe',
} as const;
export type RSVPStatus = typeof RSVPStatus[keyof typeof RSVPStatus];

/**
 * Type of event within an invitation
 */
export const EventType = {
  WEDDING: 'wedding',
  BIRTHDAY: 'birthday',
  ANNIVERSARY: 'anniversary',
  BABY_SHOWER: 'baby_shower',
  ENGAGEMENT: 'engagement',
  FESTIVAL: 'festival',
  CORPORATE: 'corporate',
  OTHER: 'other',
} as const;
export type EventType = typeof EventType[keyof typeof EventType];

/**
 * Category of invitation template
 */
export const TemplateCategory = {
  WEDDING: 'wedding',
  ENGAGEMENT: 'engagement',
  BIRTHDAY: 'birthday',
  BABY_SHOWER: 'baby_shower',
  CORPORATE: 'corporate',
  RELIGIOUS: 'religious',
  ANNIVERSARY: 'anniversary',
  FESTIVAL: 'festival',
  OTHER: 'other',
} as const;
export type TemplateCategory = typeof TemplateCategory[keyof typeof TemplateCategory];

/**
 * Guest invitation status
 */
export const GuestStatus = {
  INVITED: 'invited',
  VIEWED: 'viewed',
  RESPONDED: 'responded',
  CHECKED_IN: 'checked_in',
} as const;
export type GuestStatus = typeof GuestStatus[keyof typeof GuestStatus];
