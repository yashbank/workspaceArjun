import { describe, it, expect, afterEach } from 'vitest';
import {
  AccessBlockedError,
  ACCESS_BLOCKED_MESSAGE,
  ACCESS_BLOCKED_CODE,
  isAccessBlockedError,
  isAccessEnforced,
  isAccessDetectionEnabled,
} from './errors';

describe('AccessBlockedError', () => {
  it('carries the standard message and code', () => {
    const e = new AccessBlockedError();
    expect(e.message).toBe(ACCESS_BLOCKED_MESSAGE);
    expect(e.code).toBe(ACCESS_BLOCKED_CODE);
    expect(e.name).toBe('AccessBlockedError');
  });
});

describe('isAccessBlockedError', () => {
  it('detects the error class and code-tagged errors; rejects others', () => {
    expect(isAccessBlockedError(new AccessBlockedError())).toBe(true);
    const tagged = Object.assign(new Error('x'), { code: ACCESS_BLOCKED_CODE });
    expect(isAccessBlockedError(tagged)).toBe(true);
    expect(isAccessBlockedError(new Error('Forbidden'))).toBe(false);
    expect(isAccessBlockedError(null)).toBe(false);
  });
});

describe('access flags', () => {
  const origEnforce = process.env.ACCESS_ENFORCE;
  const origDetect = process.env.ACCESS_DETECTION;
  afterEach(() => {
    if (origEnforce === undefined) delete process.env.ACCESS_ENFORCE;
    else process.env.ACCESS_ENFORCE = origEnforce;
    if (origDetect === undefined) delete process.env.ACCESS_DETECTION;
    else process.env.ACCESS_DETECTION = origDetect;
  });

  it('enforces only when ACCESS_ENFORCE === "true"', () => {
    process.env.ACCESS_ENFORCE = 'true';
    expect(isAccessEnforced()).toBe(true);
    process.env.ACCESS_ENFORCE = 'false';
    expect(isAccessEnforced()).toBe(false);
    delete process.env.ACCESS_ENFORCE;
    expect(isAccessEnforced()).toBe(false);
  });

  it('detection is on unless ACCESS_DETECTION === "off"', () => {
    delete process.env.ACCESS_DETECTION;
    expect(isAccessDetectionEnabled()).toBe(true);
    process.env.ACCESS_DETECTION = 'off';
    expect(isAccessDetectionEnabled()).toBe(false);
  });
});
