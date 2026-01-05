/**
 * RSVP Types Verification Test
 *
 * This test file verifies that the RSVP TypeScript types are correctly defined
 * and can be used as expected. It uses compile-time type checking to validate
 * the interfaces and types.
 *
 * Feature: frontend-types-rsvp
 */

import { describe, it, expect } from 'vitest';
import type {
  // RSVP core types
  InvitationRSVP,
  SubmitRSVPRequest,
  UpdateRSVPRequest,
  RSVPSubmitResponse,
  RSVPResponse,
  RSVPListResponse,
  RSVPExportOptions,
  RSVPExportResponse,
  // Edit token types
  RSVPEditToken,
  EditTokenValidationResult,
  ValidateEditTokenRequest,
  // Validation types
  RSVPFieldValidationResult,
  RSVPValidationResult,
  RSVPValidationConstraints,
  RSVPFormConfig,
  // Supporting types
  RSVPStats,
  RSVPSettings,
  RSVPCustomQuestion,
  RSVPStatus,
  RSVPSource,
} from '../src/invitations';

describe('RSVP Types', () => {
  describe('SubmitRSVPRequest', () => {
    it('should accept valid RSVP submission data', () => {
      const submission: SubmitRSVPRequest = {
        guest_name: 'John Doe',
        guest_email: 'john@example.com',
        attending: true,
        party_size: 2,
        party_names: ['Jane Doe'],
        dietary_preferences: 'Vegetarian',
        message: 'Looking forward to the event!',
        custom_answers: { q1: 'answer1' },
      };

      expect(submission.guest_name).toBe('John Doe');
      expect(submission.attending).toBe(true);
    });

    it('should allow minimal required fields', () => {
      const minimalSubmission: SubmitRSVPRequest = {
        guest_name: 'Jane Smith',
        guest_email: 'jane@example.com',
        attending: false,
      };

      expect(minimalSubmission.guest_name).toBe('Jane Smith');
      expect(minimalSubmission.attending).toBe(false);
    });

    it('should accept optional turnstile token', () => {
      const withTurnstile: SubmitRSVPRequest = {
        guest_name: 'Test User',
        guest_email: 'test@example.com',
        attending: true,
        turnstile_token: 'CAPTCHA_TOKEN_123',
      };

      expect(withTurnstile.turnstile_token).toBe('CAPTCHA_TOKEN_123');
    });
  });

  describe('UpdateRSVPRequest', () => {
    it('should allow partial updates', () => {
      const update: UpdateRSVPRequest = {
        attending: false,
        party_size: 1,
      };

      expect(update.attending).toBe(false);
      expect(update.party_size).toBe(1);
    });

    it('should allow status update', () => {
      const statusUpdate: UpdateRSVPRequest = {
        status: 'maybe',
      };

      expect(statusUpdate.status).toBe('maybe');
    });
  });

  describe('RSVPSubmitResponse', () => {
    it('should have required rsvp_id and message', () => {
      const response: RSVPSubmitResponse = {
        rsvp_id: '123e4567-e89b-12d3-a456-426614174000',
        message: 'RSVP submitted successfully',
      };

      expect(response.rsvp_id).toBeDefined();
      expect(response.message).toBeDefined();
    });

    it('should include optional edit_token', () => {
      const responseWithToken: RSVPSubmitResponse = {
        rsvp_id: '123e4567-e89b-12d3-a456-426614174000',
        message: 'RSVP submitted successfully',
        edit_token: 'abc123xyz',
        can_edit_until: '2025-12-31T23:59:59Z',
      };

      expect(responseWithToken.edit_token).toBe('abc123xyz');
      expect(responseWithToken.can_edit_until).toBeDefined();
    });
  });

  describe('RSVPEditToken', () => {
    it('should contain token, expiration, and validity', () => {
      const editToken: RSVPEditToken = {
        token: 'secure-token-123',
        expires_at: '2025-06-01T00:00:00Z',
        is_valid: true,
      };

      expect(editToken.token).toBeDefined();
      expect(editToken.expires_at).toBeDefined();
      expect(editToken.is_valid).toBe(true);
    });
  });

  describe('EditTokenValidationResult', () => {
    it('should indicate valid token with RSVP details', () => {
      const validResult: EditTokenValidationResult = {
        valid: true,
        rsvp_id: '123e4567-e89b-12d3-a456-426614174000',
        invitation_id: '987e6543-e21b-12d3-a456-426614174000',
        guest_name: 'John Doe',
      };

      expect(validResult.valid).toBe(true);
      expect(validResult.rsvp_id).toBeDefined();
    });

    it('should indicate invalid token with error', () => {
      const invalidResult: EditTokenValidationResult = {
        valid: false,
        error: 'Token has expired',
        error_code: 'EXPIRED_TOKEN',
      };

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error_code).toBe('EXPIRED_TOKEN');
    });

    it('should handle all error codes', () => {
      const errorCodes: EditTokenValidationResult['error_code'][] = [
        'INVALID_TOKEN',
        'EXPIRED_TOKEN',
        'RSVP_NOT_FOUND',
        'INVITATION_CLOSED',
      ];

      errorCodes.forEach((code) => {
        const result: EditTokenValidationResult = {
          valid: false,
          error_code: code,
        };
        expect(result.error_code).toBe(code);
      });
    });
  });

  describe('RSVPValidationResult', () => {
    it('should contain overall validity and field results', () => {
      const validationResult: RSVPValidationResult = {
        valid: false,
        fields: [
          { field: 'guest_email', valid: false, error: 'Invalid email format' },
          { field: 'party_size', valid: true },
        ],
        errors: ['RSVP deadline has passed'],
        warnings: ['Party size close to maximum'],
      };

      expect(validationResult.valid).toBe(false);
      expect(validationResult.fields).toHaveLength(2);
      expect(validationResult.errors).toHaveLength(1);
    });
  });

  describe('RSVPValidationConstraints', () => {
    it('should define validation rules from invitation settings', () => {
      const constraints: RSVPValidationConstraints = {
        max_party_size: 5,
        require_phone: true,
        collect_dietary: true,
        deadline: '2025-05-01T00:00:00Z',
        custom_questions: [
          { question: 'Favorite color?', type: 'text', required: false },
          { question: 'Food preference?', type: 'select', options: ['Veg', 'Non-veg'], required: true },
        ],
        allow_editing: true,
        allow_duplicate_email: false,
      };

      expect(constraints.max_party_size).toBe(5);
      expect(constraints.custom_questions).toHaveLength(2);
    });
  });

  describe('RSVPFormConfig', () => {
    it('should provide frontend form configuration', () => {
      const config: RSVPFormConfig = {
        enabled: true,
        deadline: '2025-05-01T00:00:00Z',
        deadline_passed: false,
        max_party_size: 10,
        show_dietary: true,
        show_phone: true,
        require_phone: false,
        custom_questions: [],
        available_statuses: ['attending', 'not_attending', 'maybe'],
      };

      expect(config.enabled).toBe(true);
      expect(config.deadline_passed).toBe(false);
      expect(config.available_statuses).toContain('attending');
    });
  });

  describe('RSVPListResponse', () => {
    it('should contain data, stats, and pagination meta', () => {
      const listResponse: RSVPListResponse = {
        data: [],
        stats: {
          total: 10,
          attending: 5,
          not_attending: 2,
          pending: 2,
          maybe: 1,
          total_party_size: 15,
        },
        meta: {
          page: 1,
          limit: 20,
          total: 10,
          total_pages: 1,
        },
      };

      expect(listResponse.data).toEqual([]);
      expect(listResponse.stats.total).toBe(10);
      expect(listResponse.meta.page).toBe(1);
    });
  });

  describe('RSVPExportOptions', () => {
    it('should define export configuration', () => {
      const exportOptions: RSVPExportOptions = {
        format: 'csv',
        fields: ['guest_name', 'guest_email', 'attending', 'party_size'],
        status_filter: ['attending', 'maybe'],
        expand_party_names: true,
      };

      expect(exportOptions.format).toBe('csv');
      expect(exportOptions.fields).toContain('guest_name');
    });

    it('should support all export formats', () => {
      const formats: RSVPExportOptions['format'][] = ['csv', 'xlsx', 'json'];

      formats.forEach((format) => {
        const options: RSVPExportOptions = { format };
        expect(options.format).toBe(format);
      });
    });
  });

  describe('RSVPResponse', () => {
    it('should contain full RSVP details', () => {
      const response: RSVPResponse = {
        rsvp_id: '123e4567-e89b-12d3-a456-426614174000',
        invitation_id: '987e6543-e21b-12d3-a456-426614174000',
        workspace_id: '456e7890-e21b-12d3-a456-426614174000',
        guest_name: 'John Doe',
        guest_email: 'john@example.com',
        attending: true,
        party_size: 2,
        party_names: ['Jane Doe'],
        custom_answers: {},
        source: 'web',
        status: 'attending',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(response.rsvp_id).toBeDefined();
      expect(response.source).toBe('web');
      expect(response.status).toBe('attending');
    });
  });
});

describe('Type Guards and Utilities', () => {
  describe('RSVPStatus type', () => {
    it('should only accept valid status values', () => {
      const statuses: RSVPStatus[] = ['pending', 'attending', 'not_attending', 'maybe'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('RSVPSource type', () => {
    it('should only accept valid source values', () => {
      const sources: RSVPSource[] = ['web', 'qr_code', 'whatsapp', 'email_link', 'personal_link'];
      expect(sources).toHaveLength(5);
    });
  });
});
