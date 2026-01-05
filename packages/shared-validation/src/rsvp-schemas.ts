import { z } from 'zod';
import { PATTERNS } from './patterns';

/**
 * RSVP validation schemas
 *
 * Provides Zod schemas for validating RSVP submissions, updates, and edit tokens.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for guest name */
export const MAX_GUEST_NAME_LENGTH = 100;

/** Maximum length for guest message */
export const MAX_MESSAGE_LENGTH = 1000;

/** Maximum length for dietary preferences */
export const MAX_DIETARY_LENGTH = 500;

/** Maximum party size (can be overridden by invitation settings) */
export const DEFAULT_MAX_PARTY_SIZE = 10;

/** Maximum number of custom answers */
export const MAX_CUSTOM_ANSWERS = 20;

/** Edit token length (URL-safe base64 of 32 bytes) */
export const EDIT_TOKEN_LENGTH = 43;

// ---------------------------------------------------------------------------
// Base Field Schemas
// ---------------------------------------------------------------------------

/**
 * Guest name schema with validation
 */
export const guestNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(MAX_GUEST_NAME_LENGTH, `Name must be at most ${MAX_GUEST_NAME_LENGTH} characters`)
  .trim()
  .refine((val) => val.length > 0, 'Name cannot be empty after trimming');

/**
 * Guest email schema with validation
 */
export const guestEmailSchema = z
  .string()
  .email('Invalid email format')
  .max(254, 'Email must be at most 254 characters')
  .toLowerCase()
  .trim();

/**
 * Guest phone schema (optional)
 */
export const guestPhoneSchema = z
  .string()
  .regex(PATTERNS.PHONE, 'Invalid phone number format')
  .optional()
  .nullable();

/**
 * Party size schema
 */
export const partySizeSchema = z
  .number()
  .int('Party size must be a whole number')
  .min(1, 'Party size must be at least 1')
  .max(DEFAULT_MAX_PARTY_SIZE, `Party size cannot exceed ${DEFAULT_MAX_PARTY_SIZE}`);

/**
 * Party names array schema
 */
export const partyNamesSchema = z
  .array(z.string().max(MAX_GUEST_NAME_LENGTH).trim())
  .max(DEFAULT_MAX_PARTY_SIZE, `Cannot have more than ${DEFAULT_MAX_PARTY_SIZE} party members`)
  .optional()
  .default([]);

/**
 * Dietary preferences schema
 */
export const dietaryPreferencesSchema = z
  .string()
  .max(MAX_DIETARY_LENGTH, `Dietary preferences must be at most ${MAX_DIETARY_LENGTH} characters`)
  .trim()
  .optional()
  .nullable();

/**
 * Guest message schema
 */
export const guestMessageSchema = z
  .string()
  .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`)
  .trim()
  .optional()
  .nullable();

/**
 * Custom answers schema (key-value pairs)
 */
export const customAnswersSchema = z
  .record(z.string(), z.string().max(1000))
  .refine(
    (obj) => Object.keys(obj).length <= MAX_CUSTOM_ANSWERS,
    `Cannot have more than ${MAX_CUSTOM_ANSWERS} custom answers`
  )
  .optional()
  .default({});

/**
 * RSVP status enum schema
 */
export const rsvpStatusSchema = z.enum([
  'pending',
  'attending',
  'not_attending',
  'maybe',
]);

/**
 * RSVP source enum schema
 */
export const rsvpSourceSchema = z.enum([
  'web',
  'qr_code',
  'whatsapp',
  'email_link',
  'personal_link',
]);

// ---------------------------------------------------------------------------
// Edit Token Schemas
// ---------------------------------------------------------------------------

/**
 * Edit token schema
 */
export const editTokenSchema = z
  .string()
  .min(32, 'Invalid edit token')
  .max(64, 'Invalid edit token');

/**
 * Validate edit token request schema
 */
export const validateEditTokenRequestSchema = z.object({
  edit_token: editTokenSchema,
});

// ---------------------------------------------------------------------------
// RSVP Request Schemas
// ---------------------------------------------------------------------------

/**
 * RSVP submission request schema
 */
export const submitRSVPRequestSchema = z.object({
  guest_name: guestNameSchema,
  guest_email: guestEmailSchema,
  guest_phone: guestPhoneSchema,
  attending: z.boolean(),
  party_size: partySizeSchema.optional().default(1),
  party_names: partyNamesSchema,
  dietary_preferences: dietaryPreferencesSchema,
  message: guestMessageSchema,
  custom_answers: customAnswersSchema,
  sub_event_id: z.string().uuid().optional().nullable(),
  turnstile_token: z.string().optional(),
});

/**
 * RSVP update request schema
 */
export const updateRSVPRequestSchema = z.object({
  attending: z.boolean().optional(),
  party_size: partySizeSchema.optional(),
  party_names: partyNamesSchema,
  dietary_preferences: dietaryPreferencesSchema,
  message: guestMessageSchema,
  custom_answers: customAnswersSchema,
  status: rsvpStatusSchema.optional(),
});

// ---------------------------------------------------------------------------
// RSVP Custom Question Schemas
// ---------------------------------------------------------------------------

/**
 * Custom question type enum
 */
export const rsvpQuestionTypeSchema = z.enum(['text', 'select', 'checkbox']);

/**
 * Custom question schema
 */
export const rsvpCustomQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  type: rsvpQuestionTypeSchema,
  options: z.array(z.string().max(200)).max(10).optional(),
  required: z.boolean().default(false),
});

/**
 * RSVP settings schema
 */
export const rsvpSettingsSchema = z.object({
  enabled: z.boolean(),
  deadline: z.string().datetime().optional().nullable(),
  max_party_size: z.number().int().min(1).max(50).default(DEFAULT_MAX_PARTY_SIZE),
  collect_dietary: z.boolean().default(false),
  collect_phone: z.boolean().default(false),
  custom_questions: z.array(rsvpCustomQuestionSchema).max(10).default([]),
});

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Create a party size schema with a custom maximum
 */
export function createPartySizeSchema(maxSize: number) {
  return z
    .number()
    .int('Party size must be a whole number')
    .min(1, 'Party size must be at least 1')
    .max(maxSize, `Party size cannot exceed ${maxSize}`);
}

/**
 * Create a submit RSVP schema with custom validation constraints
 */
export function createSubmitRSVPSchema(constraints: {
  maxPartySize?: number;
  requirePhone?: boolean;
  collectDietary?: boolean;
}) {
  const { maxPartySize = DEFAULT_MAX_PARTY_SIZE, requirePhone = false } = constraints;

  return z.object({
    guest_name: guestNameSchema,
    guest_email: guestEmailSchema,
    guest_phone: requirePhone
      ? guestPhoneSchema.unwrap().unwrap()
      : guestPhoneSchema,
    attending: z.boolean(),
    party_size: createPartySizeSchema(maxPartySize).optional().default(1),
    party_names: z
      .array(z.string().max(MAX_GUEST_NAME_LENGTH).trim())
      .max(maxPartySize)
      .optional()
      .default([]),
    dietary_preferences: dietaryPreferencesSchema,
    message: guestMessageSchema,
    custom_answers: customAnswersSchema,
    sub_event_id: z.string().uuid().optional().nullable(),
    turnstile_token: z.string().optional(),
  });
}

/**
 * Validate RSVP party names match party size
 */
export function validatePartyNamesMatchSize(
  partyNames: string[] | undefined,
  partySize: number
): { valid: boolean; error?: string } {
  if (!partyNames || partyNames.length === 0) {
    return { valid: true };
  }

  if (partyNames.length > partySize) {
    return {
      valid: false,
      error: `Party names (${partyNames.length}) cannot exceed party size (${partySize})`,
    };
  }

  return { valid: true };
}

/**
 * Check if RSVP deadline has passed
 */
export function isRSVPDeadlinePassed(deadline: string | null | undefined): boolean {
  if (!deadline) {
    return false;
  }

  try {
    const deadlineDate = new Date(deadline);
    return deadlineDate < new Date();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type SubmitRSVPInput = z.infer<typeof submitRSVPRequestSchema>;
export type UpdateRSVPInput = z.infer<typeof updateRSVPRequestSchema>;
export type RSVPSettingsInput = z.infer<typeof rsvpSettingsSchema>;
export type RSVPCustomQuestionInput = z.infer<typeof rsvpCustomQuestionSchema>;
