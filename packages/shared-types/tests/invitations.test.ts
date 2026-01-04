import { describe, it, expect } from 'vitest';
import {
  InvitationStatus,
  RSVPStatus,
  EventType,
  TemplateCategory,
  GuestStatus,
} from '../src/invitations';

const invitationStatuses = ['draft', 'published', 'expired', 'cancelled'];
const rsvpStatuses = ['pending', 'attending', 'not_attending', 'maybe'];
const eventTypes = [
  'ceremony',
  'reception',
  'after_party',
  'mehndi',
  'sangeet',
  'haldi',
  'cocktail',
  'rehearsal_dinner',
  'brunch',
  'other',
];
const templateCategories = [
  'wedding',
  'engagement',
  'birthday',
  'baby_shower',
  'corporate',
  'religious',
  'other',
];
const guestStatuses = ['invited', 'viewed', 'responded', 'checked_in'];

describe('Invitation domain enums', () => {
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
