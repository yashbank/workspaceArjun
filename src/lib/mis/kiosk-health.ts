/**
 * How stale is a gate tablet? Pure — the device list, the attendance-home card
 * and the tests all read this one module (D19).
 *
 * Green / amber / red follow MIS_UI_SPEC §4.2. Two clocks, because they answer
 * different questions: *sync* age says whether the tablet is still in contact
 * (are punches arriving?); *list* age says whether its employee list can be
 * trusted (K6: "two days old" explains the unrecognised badges).
 */

export type KioskHealthLevel = 'GREEN' | 'AMBER' | 'RED';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** D19 — silence up to this long is fine. */
export const SYNC_GREEN_MS = 30 * MINUTE;
/** D19 — up to one shift of silence is amber; beyond it (or never) is red. */
export const SYNC_AMBER_MS = 8 * HOUR;
/** D19 — an employee list up to a day old is fine. */
export const CACHE_GREEN_MS = 24 * HOUR;
/** D19 — up to three days is amber; beyond it is red. */
export const CACHE_AMBER_MS = 72 * HOUR;

function level(at: Date | null | undefined, now: Date, greenMs: number, amberMs: number): KioskHealthLevel {
  if (!at) return 'RED'; // never heard from is the worst state, not an unknown one
  const age = now.getTime() - at.getTime();
  // A clock a little ahead of the server reads as "just now", not as an error.
  if (age <= greenMs) return 'GREEN';
  if (age <= amberMs) return 'AMBER';
  return 'RED';
}

export function syncLevel(lastSyncAt: Date | null | undefined, now: Date): KioskHealthLevel {
  return level(lastSyncAt, now, SYNC_GREEN_MS, SYNC_AMBER_MS);
}

export function cacheLevel(lastPullAt: Date | null | undefined, now: Date): KioskHealthLevel {
  return level(lastPullAt, now, CACHE_GREEN_MS, CACHE_AMBER_MS);
}

const ORDER: KioskHealthLevel[] = ['GREEN', 'AMBER', 'RED'];

/** The worse of several levels — one tablet's card colour, or the whole gate's. */
export function worstLevel(levels: readonly KioskHealthLevel[]): KioskHealthLevel {
  return levels.reduce<KioskHealthLevel>(
    (worst, l) => (ORDER.indexOf(l) > ORDER.indexOf(worst) ? l : worst),
    'GREEN',
  );
}

/** "40 seconds", "3 h 12 m", "2 days" — plain words, never a percentage in a corner (K12). */
export function describeAge(at: Date | null | undefined, now: Date): string {
  if (!at) return 'never';
  const ms = Math.max(0, now.getTime() - at.getTime());
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))} seconds`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} minutes`;
  if (ms < 24 * HOUR) {
    const h = Math.floor(ms / HOUR);
    const m = Math.round((ms - h * HOUR) / MINUTE);
    return m > 0 ? `${h} h ${m} m` : `${h} h`;
  }
  const d = Math.floor(ms / (24 * HOUR));
  return d === 1 ? '1 day' : `${d} days`;
}

// ---------------------------------------------------------------------------
// The attendance-home card (R5: "Kiosk health is the top card")
// ---------------------------------------------------------------------------

export type KioskCardDevice = {
  id: string;
  name: string;
  level: KioskHealthLevel;
  /** "40 seconds", "3 h 12 m", "never" — already in words, computed on the server. */
  syncedAgo: string;
  /** "nothing queued" / "14 punches queued" */
  queued: string;
  /** Set when the battery is the real risk (K12): low and not charging. */
  batteryWarning: string | null;
};

export type KioskCardData = {
  /** The worst tablet decides the card's colour; null when nothing is enrolled. */
  level: KioskHealthLevel | null;
  devices: KioskCardDevice[];
};

export type KioskSummaryInput = {
  level: KioskHealthLevel | null;
  devices: {
    id: string;
    name: string;
    level: KioskHealthLevel;
    lastSyncAt: Date | null;
    queuedPunches: number | null;
    batteryPercent: number | null;
    isCharging: boolean | null;
  }[];
};

/** Below this, a tablet that is not charging will not last the shift (K12). */
export const BATTERY_WARN_PERCENT = 50;

/** Turn the server's summary into what the card prints, in plain words (K12). */
export function toKioskCard(summary: KioskSummaryInput, now: Date): KioskCardData {
  return {
    level: summary.level,
    devices: summary.devices.map((d) => ({
      id: d.id,
      name: d.name,
      level: d.level,
      syncedAgo: describeAge(d.lastSyncAt, now),
      queued:
        d.queuedPunches === null
          ? 'queue unknown'
          : d.queuedPunches === 0
            ? 'nothing queued'
            : `${d.queuedPunches} ${d.queuedPunches === 1 ? 'punch' : 'punches'} queued`,
      batteryWarning:
        d.isCharging === false && d.batteryPercent !== null && d.batteryPercent < BATTERY_WARN_PERCENT
          ? `Not charging at ${d.batteryPercent}%. Plug it in.`
          : null,
    })),
  };
}
