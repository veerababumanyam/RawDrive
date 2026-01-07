import { z } from 'zod';
/**
 * RSVP validation schemas
 *
 * Provides Zod schemas for validating RSVP submissions, updates, and edit tokens.
 */
/** Maximum length for guest name */
export declare const MAX_GUEST_NAME_LENGTH = 100;
/** Maximum length for guest message */
export declare const MAX_MESSAGE_LENGTH = 1000;
/** Maximum length for dietary preferences */
export declare const MAX_DIETARY_LENGTH = 500;
/** Maximum party size (can be overridden by invitation settings) */
export declare const DEFAULT_MAX_PARTY_SIZE = 10;
/** Maximum number of custom answers */
export declare const MAX_CUSTOM_ANSWERS = 20;
/** Edit token length (URL-safe base64 of 32 bytes) */
export declare const EDIT_TOKEN_LENGTH = 43;
/**
 * Guest name schema with validation
 */
export declare const guestNameSchema: z.ZodString;
/**
 * Guest email schema with validation
 */
export declare const guestEmailSchema: z.ZodString;
/**
 * Guest phone schema (optional)
 */
export declare const guestPhoneSchema: z.ZodNullable<z.ZodOptional<z.ZodString>>;
/**
 * Party size schema
 */
export declare const partySizeSchema: z.ZodNumber;
/**
 * Party names array schema
 */
export declare const partyNamesSchema: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
/**
 * Dietary preferences schema
 */
export declare const dietaryPreferencesSchema: z.ZodNullable<z.ZodOptional<z.ZodString>>;
/**
 * Guest message schema
 */
export declare const guestMessageSchema: z.ZodNullable<z.ZodOptional<z.ZodString>>;
/**
 * Custom answers schema (key-value pairs)
 */
export declare const customAnswersSchema: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
/**
 * RSVP status enum schema
 */
export declare const rsvpStatusSchema: z.ZodEnum<{
    pending: "pending";
    attending: "attending";
    not_attending: "not_attending";
    maybe: "maybe";
}>;
/**
 * RSVP source enum schema
 */
export declare const rsvpSourceSchema: z.ZodEnum<{
    web: "web";
    qr_code: "qr_code";
    whatsapp: "whatsapp";
    email_link: "email_link";
    personal_link: "personal_link";
}>;
/**
 * Edit token schema
 */
export declare const editTokenSchema: z.ZodString;
/**
 * Validate edit token request schema
 */
export declare const validateEditTokenRequestSchema: z.ZodObject<{
    edit_token: z.ZodString;
}, z.core.$strip>;
/**
 * RSVP submission request schema
 */
export declare const submitRSVPRequestSchema: z.ZodObject<{
    guest_name: z.ZodString;
    guest_email: z.ZodString;
    guest_phone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    attending: z.ZodBoolean;
    party_size: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    party_names: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    dietary_preferences: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    message: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    custom_answers: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    sub_event_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    turnstile_token: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * RSVP update request schema
 */
export declare const updateRSVPRequestSchema: z.ZodObject<{
    attending: z.ZodOptional<z.ZodBoolean>;
    party_size: z.ZodOptional<z.ZodNumber>;
    party_names: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    dietary_preferences: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    message: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    custom_answers: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    status: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        attending: "attending";
        not_attending: "not_attending";
        maybe: "maybe";
    }>>;
}, z.core.$strip>;
/**
 * Custom question type enum
 */
export declare const rsvpQuestionTypeSchema: z.ZodEnum<{
    text: "text";
    select: "select";
    checkbox: "checkbox";
}>;
/**
 * Custom question schema
 */
export declare const rsvpCustomQuestionSchema: z.ZodObject<{
    question: z.ZodString;
    type: z.ZodEnum<{
        text: "text";
        select: "select";
        checkbox: "checkbox";
    }>;
    options: z.ZodOptional<z.ZodArray<z.ZodString>>;
    required: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
/**
 * RSVP settings schema
 */
export declare const rsvpSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    deadline: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    max_party_size: z.ZodDefault<z.ZodNumber>;
    collect_dietary: z.ZodDefault<z.ZodBoolean>;
    collect_phone: z.ZodDefault<z.ZodBoolean>;
    custom_questions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        type: z.ZodEnum<{
            text: "text";
            select: "select";
            checkbox: "checkbox";
        }>;
        options: z.ZodOptional<z.ZodArray<z.ZodString>>;
        required: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * Create a party size schema with a custom maximum
 */
export declare function createPartySizeSchema(maxSize: number): z.ZodNumber;
/**
 * Create a submit RSVP schema with custom validation constraints
 */
export declare function createSubmitRSVPSchema(constraints: {
    maxPartySize?: number;
    requirePhone?: boolean;
    collectDietary?: boolean;
}): z.ZodObject<{
    guest_name: z.ZodString;
    guest_email: z.ZodString;
    guest_phone: z.ZodString | z.ZodNullable<z.ZodOptional<z.ZodString>>;
    attending: z.ZodBoolean;
    party_size: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    party_names: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    dietary_preferences: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    message: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    custom_answers: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    sub_event_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    turnstile_token: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Validate RSVP party names match party size
 */
export declare function validatePartyNamesMatchSize(partyNames: string[] | undefined, partySize: number): {
    valid: boolean;
    error?: string;
};
/**
 * Check if RSVP deadline has passed
 */
export declare function isRSVPDeadlinePassed(deadline: string | null | undefined): boolean;
export type SubmitRSVPInput = z.infer<typeof submitRSVPRequestSchema>;
export type UpdateRSVPInput = z.infer<typeof updateRSVPRequestSchema>;
export type RSVPSettingsInput = z.infer<typeof rsvpSettingsSchema>;
export type RSVPCustomQuestionInput = z.infer<typeof rsvpCustomQuestionSchema>;
//# sourceMappingURL=rsvp-schemas.d.ts.map