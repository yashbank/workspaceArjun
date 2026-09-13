import { beforeEach, describe, expect, it } from 'vitest';
import { isMisEnabled } from './flags';

describe('isMisEnabled', () => {
  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.MIS_ENABLED_ACCOUNTS;
  });

  it('returns false when userId is empty', () => {
    expect(isMisEnabled('')).toBe(false);
  });

  it('returns false when env var is not set', () => {
    expect(isMisEnabled('user-123')).toBe(false);
  });

  it('returns true when userId is in env allow-list', () => {
    process.env.MIS_ENABLED_ACCOUNTS = 'user-123,user-456';
    expect(isMisEnabled('user-123')).toBe(true);
    expect(isMisEnabled('user-456')).toBe(true);
  });

  it('returns false when userId is not in env allow-list', () => {
    process.env.MIS_ENABLED_ACCOUNTS = 'user-123,user-456';
    expect(isMisEnabled('user-789')).toBe(false);
  });

  it('handles whitespace in allow-list', () => {
    process.env.MIS_ENABLED_ACCOUNTS = 'user-123, user-456 , user-789';
    expect(isMisEnabled('user-456')).toBe(true);
    expect(isMisEnabled('user-789')).toBe(true);
  });

  it('returns false by default (feature off)', () => {
    expect(isMisEnabled('any-user')).toBe(false);
  });

  it('handles single user in allow-list', () => {
    process.env.MIS_ENABLED_ACCOUNTS = 'yash-user-id';
    expect(isMisEnabled('yash-user-id')).toBe(true);
  });

  it('is case-sensitive for user IDs', () => {
    process.env.MIS_ENABLED_ACCOUNTS = 'user-123';
    expect(isMisEnabled('User-123')).toBe(false);
    expect(isMisEnabled('USER-123')).toBe(false);
  });
});
