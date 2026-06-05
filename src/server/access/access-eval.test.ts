import { describe, it, expect } from 'vitest';
import { isAccessBypassed, evaluateAccess, isAccessAllowed } from './index';

describe('isAccessBypassed', () => {
  it('bypasses owner and admin only', () => {
    expect(isAccessBypassed('owner')).toBe(true);
    expect(isAccessBypassed('admin')).toBe(true);
    expect(isAccessBypassed('member')).toBe(false);
    expect(isAccessBypassed('viewer')).toBe(false);
  });
});

describe('evaluateAccess', () => {
  const none = { ipAllowed: false, deviceApproved: false };
  const ipOnly = { ipAllowed: true, deviceApproved: false };
  const devOnly = { ipAllowed: false, deviceApproved: true };
  const both = { ipAllowed: true, deviceApproved: true };

  it('unrestricted always allows', () => {
    expect(evaluateAccess('unrestricted', none)).toBe(true);
  });

  it('ip mode follows ipAllowed', () => {
    expect(evaluateAccess('ip', ipOnly)).toBe(true);
    expect(evaluateAccess('ip', devOnly)).toBe(false);
  });

  it('device mode follows deviceApproved', () => {
    expect(evaluateAccess('device', devOnly)).toBe(true);
    expect(evaluateAccess('device', ipOnly)).toBe(false);
  });

  it('ip_and_device requires both', () => {
    expect(evaluateAccess('ip_and_device', both)).toBe(true);
    expect(evaluateAccess('ip_and_device', ipOnly)).toBe(false);
    expect(evaluateAccess('ip_and_device', devOnly)).toBe(false);
  });

  it('ip_or_device requires either', () => {
    expect(evaluateAccess('ip_or_device', ipOnly)).toBe(true);
    expect(evaluateAccess('ip_or_device', devOnly)).toBe(true);
    expect(evaluateAccess('ip_or_device', none)).toBe(false);
  });
});

describe('isAccessAllowed', () => {
  it('owner/admin bypass even on the strictest mode with nothing allowed', () => {
    expect(
      isAccessAllowed({ role: 'owner', mode: 'ip_and_device', ipAllowed: false, deviceApproved: false }),
    ).toBe(true);
    expect(
      isAccessAllowed({ role: 'admin', mode: 'ip_and_device', ipAllowed: false, deviceApproved: false }),
    ).toBe(true);
  });

  it('member is governed by the mode', () => {
    expect(
      isAccessAllowed({ role: 'member', mode: 'ip_and_device', ipAllowed: true, deviceApproved: true }),
    ).toBe(true);
    expect(
      isAccessAllowed({ role: 'member', mode: 'ip_and_device', ipAllowed: true, deviceApproved: false }),
    ).toBe(false);
    expect(
      isAccessAllowed({ role: 'member', mode: 'unrestricted', ipAllowed: false, deviceApproved: false }),
    ).toBe(true);
  });
});
