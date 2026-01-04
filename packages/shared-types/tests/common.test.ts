import { describe, it, expect } from 'vitest';
import type { PaginationMeta, PaginatedResponse, ErrorResponse, SuccessResponse } from '../src/common';

const pagination: PaginationMeta = {
  total: 25,
  page: 1,
  limit: 10,
  total_pages: 3,
};

const paginatedUsers: PaginatedResponse<{ id: string }> = {
  data: [{ id: 'u1' }, { id: 'u2' }],
  pagination,
};

const error: ErrorResponse = {
  error: 'validation_error',
  message: 'Invalid input',
  details: [{ field: 'email', message: 'Invalid email format' }],
  request_id: 'req-123',
};

const success: SuccessResponse<string> = {
  data: 'ok',
  message: 'done',
};

describe('Common response types', () => {
  it('PaginatedResponse carries pagination metadata', () => {
    expect(paginatedUsers.pagination.total).toBe(25);
    expect(paginatedUsers.data).toHaveLength(2);
  });

  it('ErrorResponse shape matches contract', () => {
    expect(error.details?.[0]?.field).toBe('email');
    expect(error.error).toBe('validation_error');
  });

  it('SuccessResponse allows generic payloads', () => {
    expect(success.data).toBe('ok');
    expect(success.message).toBe('done');
  });
});
