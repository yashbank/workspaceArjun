import { describe, expect, it } from 'vitest';

import {
  cacheLevel,
  CACHE_AMBER_MS,
  CACHE_GREEN_MS,
  describeAge,
  syncLevel,
  SYNC_AMBER_MS,
  SYNC_GREEN_MS,
  toKioskCard,
  worstLevel,
} from './kiosk-health';

const now = new Date('2026-09-20T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('sync staleness (D19)', () => {
  it('is green up to the green limit, amber up to the amber limit, red beyond', () => {
    expect(syncLevel(ago(40_000), now)).toBe('GREEN');
    expect(syncLevel(ago(SYNC_GREEN_MS), now)).toBe('GREEN');
    expect(syncLevel(ago(SYNC_GREEN_MS + 1), now)).toBe('AMBER');
    expect(syncLevel(ago(SYNC_AMBER_MS), now)).toBe('AMBER');
    expect(syncLevel(ago(SYNC_AMBER_MS + 1), now)).toBe('RED');
  });

  it('K12’s own example — three hours offline — is amber, not an emergency', () => {
    expect(syncLevel(ago((3 * 60 + 12) * 60_000), now)).toBe('AMBER');
  });

  it('is red when the tablet has never synced — never an "unknown" that looks fine', () => {
    expect(syncLevel(null, now)).toBe('RED');
    expect(syncLevel(undefined, now)).toBe('RED');
  });

  it('treats a tablet clock a little ahead as just now', () => {
    expect(syncLevel(new Date(now.getTime() + 5_000), now)).toBe('GREEN');
  });
});

describe('employee list staleness (D19)', () => {
  it('follows its own, slower scale — K12’s "2 days old" is amber', () => {
    expect(cacheLevel(ago(CACHE_GREEN_MS), now)).toBe('GREEN');
    expect(cacheLevel(ago(2 * 24 * 3_600_000), now)).toBe('AMBER');
    expect(cacheLevel(ago(CACHE_AMBER_MS + 1), now)).toBe('RED');
    expect(cacheLevel(null, now)).toBe('RED');
  });
});

describe('worstLevel', () => {
  it('takes the worse of several', () => {
    expect(worstLevel(['GREEN', 'AMBER', 'GREEN'])).toBe('AMBER');
    expect(worstLevel(['GREEN', 'RED', 'AMBER'])).toBe('RED');
    expect(worstLevel(['GREEN'])).toBe('GREEN');
  });
});

describe('describeAge — plain words, never a percentage in a corner (K12)', () => {
  it.each([
    [40_000, '40 seconds'],
    [5 * 60_000, '5 minutes'],
    [(3 * 60 + 12) * 60_000, '3 h 12 m'],
    [2 * 3_600_000, '2 h'],
    [26 * 3_600_000, '1 day'],
    [2 * 24 * 3_600_000 + 5, '2 days'],
  ])('%d ms → %s', (ms, words) => {
    expect(describeAge(ago(ms), now)).toBe(words);
  });

  it('says never for a tablet that has not synced', () => {
    expect(describeAge(null, now)).toBe('never');
  });
});

describe('toKioskCard — what the attendance home prints (R5, K12)', () => {
  const dev = (o: Partial<Parameters<typeof toKioskCard>[0]['devices'][number]> = {}) => ({
    id: 'd1',
    name: 'GATE-01',
    level: 'GREEN' as const,
    lastSyncAt: ago(40_000),
    queuedPunches: 0,
    batteryPercent: 90,
    isCharging: true,
    ...o,
  });

  it('says "40 seconds" and "nothing queued" for a healthy tablet, exactly as R5 draws it', () => {
    const card = toKioskCard({ level: 'GREEN', devices: [dev()] }, now);
    expect(card.devices[0]).toMatchObject({ syncedAgo: '40 seconds', queued: 'nothing queued', batteryWarning: null });
  });

  it('counts queued punches in words, and says so when the queue size is unknown', () => {
    expect(toKioskCard({ level: 'AMBER', devices: [dev({ queuedPunches: 14 })] }, now).devices[0].queued).toBe('14 punches queued');
    expect(toKioskCard({ level: 'AMBER', devices: [dev({ queuedPunches: 1 })] }, now).devices[0].queued).toBe('1 punch queued');
    expect(toKioskCard({ level: 'AMBER', devices: [dev({ queuedPunches: null })] }, now).devices[0].queued).toBe('queue unknown');
  });

  it('warns in a sentence — not a percentage in a corner — when the battery is the real risk', () => {
    const card = toKioskCard({ level: 'AMBER', devices: [dev({ batteryPercent: 38, isCharging: false })] }, now);
    expect(card.devices[0].batteryWarning).toBe('Not charging at 38%. Plug it in.');
  });

  it('does not warn about a low battery that is charging, or an unknown one', () => {
    expect(toKioskCard({ level: 'GREEN', devices: [dev({ batteryPercent: 20, isCharging: true })] }, now).devices[0].batteryWarning).toBeNull();
    expect(toKioskCard({ level: 'GREEN', devices: [dev({ batteryPercent: null, isCharging: null })] }, now).devices[0].batteryWarning).toBeNull();
  });

  it('says "never" for a tablet that has not synced', () => {
    expect(toKioskCard({ level: 'RED', devices: [dev({ level: 'RED', lastSyncAt: null })] }, now).devices[0].syncedAgo).toBe('never');
  });

  it('keeps level null when nothing is enrolled', () => {
    expect(toKioskCard({ level: null, devices: [] }, now)).toEqual({ level: null, devices: [] });
  });
});
