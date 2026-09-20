import {
  isRetryablePark,
  type ParkReason,
  type QueuedWriteEnvelope,
  type QueuedWriteKind,
  type ReplayOutcome,
} from './idempotency';

/**
 * The offline write queue — client-side, IndexedDB, no dependencies.
 *
 * The contract is `docs/DEVELOPMENT_GUIDE.md` **Appendix B**. This file
 * imports nothing from `src/server/**` and never will (§B.9): it is the code
 * that runs on a tablet in a corner of the factory with no signal.
 *
 * It also imports no server action. A **sender registry** maps a kind to the
 * function that transmits it, and the app layer registers those at startup —
 * so this module stays transport-agnostic and a test can register a fake
 * sender and assert the whole replay loop with no network and no database.
 */

export type QueuedItemStatus = 'PENDING' | 'IN_FLIGHT' | 'PARKED' | 'REJECTED';

export type QueuedItem = {
  key: string;
  kind: QueuedWriteKind;
  payload: unknown;
  /** The moment of the tap. The replay order (§B.6) and, for some kinds, the business time (D15). */
  clientRecordedAt: string;
  status: QueuedItemStatus;
  attempts: number;
  /** Set once the item is parked or rejected — the sentence a human reads. */
  reason?: ParkReason;
  detail?: string;
  /** Earliest time a retry may be attempted. Exponential backoff (§B.6). */
  nextAttemptAt?: number;
  /** A one-line description the queue list can show without knowing the kind. */
  label?: string;
  /** Who made the entry and on which device — evidence, and the actor check at replay (§B.10.2). */
  queuedBy?: string;
  deviceId?: string;
  /**
   * A human asked for this held write to be replayed (§B.10.4). Sent to the
   * server, which honours it only for the reasons D17 lists; cleared as soon as
   * the server answers with a verdict.
   */
  humanRetry?: boolean;
};

/**
 * May the person at this device ask for this item to be replayed?
 *
 * Mirrors the server's rule (D17) so the UI never offers a button that cannot
 * work: a REJECTED entry is never replayed, and a clearance or clock hold needs
 * an audited override rather than a retry. `PREDECESSOR_PARKED` is a local hold
 * and is released by resolving its predecessor, so trying again is safe — it
 * simply re-parks if the predecessor is still held.
 */
export function canRetry(item: QueuedItem): boolean {
  if (item.status !== 'PARKED') return false;
  return item.reason === 'PREDECESSOR_PARKED' || isRetryablePark(item.reason);
}

/**
 * The storage seam.
 *
 * IndexedDB in a browser, memory in a test or on the server during SSR. The
 * replay engine below only ever sees this interface, which is what makes the
 * ordering, backoff and outcome handling testable without a browser.
 */
export type QueueStore = {
  put(item: QueuedItem): Promise<void>;
  get(key: string): Promise<QueuedItem | undefined>;
  all(): Promise<QueuedItem[]>;
  delete(key: string): Promise<void>;
};

/** What a registered sender must return — the server's verdict, already classified. */
export type SendResult = {
  outcome: ReplayOutcome;
  reason?: ParkReason;
  detail?: string;
};

export type Sender = (item: QueuedItem) => Promise<SendResult>;

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export function memoryStore(seed: QueuedItem[] = []): QueueStore {
  const rows = new Map<string, QueuedItem>(seed.map((i) => [i.key, i]));
  return {
    async put(item) {
      rows.set(item.key, item);
    },
    async get(key) {
      return rows.get(key);
    },
    async all() {
      return [...rows.values()];
    },
    async delete(key) {
      rows.delete(key);
    },
  };
}

const DB_NAME = 'mis-offline';
const DB_VERSION = 1;
const STORE = 'writes';

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB, not localStorage — MIS-86 is explicit about why: localStorage is
 * too small for a morning of punches and synchronous enough to jank the scan
 * screen while it writes.
 */
export function indexedDbStore(): QueueStore {
  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await openDb();
    try {
      const tx = database.transaction(STORE, mode);
      return await requestAsPromise(fn(tx.objectStore(STORE)));
    } finally {
      database.close();
    }
  };

  return {
    put: (item) => withStore('readwrite', (s) => s.put(item) as IDBRequest<unknown>).then(() => undefined),
    get: (key) => withStore('readonly', (s) => s.get(key) as IDBRequest<QueuedItem | undefined>),
    all: () => withStore('readonly', (s) => s.getAll() as IDBRequest<QueuedItem[]>),
    delete: (key) => withStore('readwrite', (s) => s.delete(key) as IDBRequest<undefined>).then(() => undefined),
  };
}

/** Available only where IndexedDB is (a browser); memory everywhere else, so SSR never throws. */
export function defaultStore(): QueueStore {
  return typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore();
}

// ---------------------------------------------------------------------------
// Ordering and backoff
// ---------------------------------------------------------------------------

/**
 * Per-device FIFO **by `clientRecordedAt`** — the moment the human acted, not
 * the moment the row hit IndexedDB and not the moment it reaches the server
 * (§B.6). Ties break on the key so the order is total and stable.
 */
export function replayOrder(items: QueuedItem[]): QueuedItem[] {
  return [...items].sort((a, b) => {
    const byTime = a.clientRecordedAt.localeCompare(b.clientRecordedAt);
    return byTime !== 0 ? byTime : a.key.localeCompare(b.key);
  });
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

/** Exponential with jitter, capped at a minute (§B.6). */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(raw * (0.5 + random() * 0.5));
}

export function isBlocked(item: QueuedItem): boolean {
  return item.status === 'PARKED' || item.status === 'REJECTED';
}

/**
 * A clock-out whose clock-in parked must park too, rather than applying
 * against a state its predecessor never created (§B.6). Kinds that pair this
 * way are declared here; everything else is independent.
 */
const DEPENDS_ON: Partial<Record<QueuedWriteKind, QueuedWriteKind>> = {
  'attendance.punch_out': 'attendance.punch_in',
};

/**
 * WHOSE clock-in? The dependency above is per PERSON, never per kind. Phase 10 tracked
 * it per kind, so one unrecognised badge's parked clock-in parked *every other
 * person's* clock-out — the exact failure K2 is designed against ("one unrecognised
 * badge stops a whole morning of punches"). A kind with no subject here keeps the
 * old, kind-wide behaviour.
 */
const SUBJECT_OF: Partial<Record<QueuedWriteKind, (item: QueuedItem) => string | undefined>> = {
  'attendance.punch_in': punchSubject,
  'attendance.punch_out': punchSubject,
};

function punchSubject(item: QueuedItem): string | undefined {
  const code = (item.payload as { badgeCode?: unknown } | null)?.badgeCode;
  // Upper-cased, as the server does when it resolves a badge.
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : undefined;
}

/** What "blocked" is remembered under: the kind, and the person when the kind has one. */
function blockKey(kind: QueuedWriteKind, item: QueuedItem): string {
  return `${kind}:${SUBJECT_OF[kind]?.(item) ?? ''}`;
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export type QueueSnapshot = {
  pending: number;
  failed: number;
  items: QueuedItem[];
  lastSyncedAt: number | null;
  online: boolean;
};

export class OfflineQueue {
  private senders = new Map<QueuedWriteKind, Sender>();
  private listeners = new Set<(snapshot: QueueSnapshot) => void>();
  private replaying = false;
  private lastSyncedAt: number | null = null;

  constructor(private readonly store: QueueStore = defaultStore()) {}

  /** The app layer supplies transports; this module imports no server action (§B.9). */
  register(kind: QueuedWriteKind, sender: Sender) {
    this.senders.set(kind, sender);
  }

  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    void this.notify();
    return () => this.listeners.delete(listener);
  }

  /**
   * Accept a write. The key came from the tap (§B.2) and is stored with it —
   * it is never regenerated here, because a key generated at send time
   * deduplicates nothing.
   */
  async enqueue(envelope: QueuedWriteEnvelope, label?: string): Promise<QueuedItem> {
    const item: QueuedItem = {
      key: envelope.key,
      kind: envelope.kind,
      payload: envelope.payload,
      clientRecordedAt: envelope.clientRecordedAt,
      status: 'PENDING',
      attempts: 0,
      label,
      queuedBy: envelope.queuedBy,
      deviceId: envelope.deviceId,
    };
    await this.store.put(item);
    await this.notify();
    return item;
  }

  async snapshot(): Promise<QueueSnapshot> {
    const items = replayOrder(await this.store.all());
    return {
      items,
      pending: items.filter((i) => !isBlocked(i)).length,
      failed: items.filter(isBlocked).length,
      lastSyncedAt: this.lastSyncedAt,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    };
  }

  /**
   * Replay everything that is due, oldest first, one at a time.
   *
   * Sequential on purpose (§B.6): a clock-out must never overtake its
   * clock-in. A parked or rejected item steps aside and the queue continues
   * past it — otherwise one unrecognised badge stops a whole morning of
   * punches, which is the failure `K2-Offline-sync-queue.png` is designed
   * against.
   */
  async replay(now: number = Date.now()): Promise<void> {
    if (this.replaying) return;
    this.replaying = true;
    try {
      const items = replayOrder(await this.store.all());
      // Only what came BEFORE an item can hold it back: a clock-out follows its clock-in.
      const blocked = new Set<string>();

      for (const item of items) {
        if (isBlocked(item)) {
          blocked.add(blockKey(item.kind, item));
          continue;
        }
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;

        const dependsOn = DEPENDS_ON[item.kind];
        if (dependsOn && blocked.has(blockKey(dependsOn, item))) {
          await this.store.put({
            ...item,
            status: 'PARKED',
            reason: 'PREDECESSOR_PARKED',
            detail: 'The entry this one follows is waiting for someone to resolve it.',
          });
          blocked.add(blockKey(item.kind, item));
          continue;
        }

        const sender = this.senders.get(item.kind);
        if (!sender) continue; // Nothing registered yet — try again next pass.

        await this.store.put({ ...item, status: 'IN_FLIGHT' });
        // try/catch, not .catch() — a sender that throws *synchronously* while
        // building its payload must be a retry like any other failure, not an
        // exception that takes down the whole replay pass with it.
        let result: SendResult;
        try {
          result = await sender(item);
        } catch (error) {
          result = { outcome: 'RETRY', detail: error instanceof Error ? error.message : String(error) };
        }

        switch (result.outcome) {
          case 'APPLIED':
          case 'DUPLICATE':
            // A duplicate already succeeded. Retire it; do not park it.
            await this.store.delete(item.key);
            this.lastSyncedAt = now;
            break;
          case 'PARKED':
          case 'REJECTED':
            await this.store.put({
              ...item,
              status: result.outcome,
              attempts: item.attempts + 1,
              reason: result.reason,
              detail: result.detail,
              humanRetry: undefined, // the server has answered; the ask is spent
            });
            blocked.add(blockKey(item.kind, item));
            break;
          case 'RETRY':
          default: {
            const attempts = item.attempts + 1;
            await this.store.put({
              ...item,
              status: 'PENDING',
              attempts,
              detail: result.detail,
              nextAttemptAt: now + backoffMs(attempts),
            });
            // Stop the pass: the link is probably down, and hammering the rest
            // of the queue against it only burns battery.
            await this.notify();
            return;
          }
        }
      }
    } finally {
      this.replaying = false;
      await this.notify();
    }
  }

  /**
   * A human asked to try again. Only for a hold a retry may release (D17) —
   * anything else is refused here as well as on the server, so a stale button
   * cannot launder a hold that needs an audited override.
   */
  async retry(key: string): Promise<boolean> {
    const item = await this.store.get(key);
    if (!item || !canRetry(item)) return false;
    await this.store.put({
      ...item,
      status: 'PENDING',
      nextAttemptAt: undefined,
      reason: undefined,
      humanRetry: true,
    });
    await this.notify();
    return true;
  }

  /**
   * Remove an item from **this device's** queue.
   *
   * Note what this does not do: a write that reached the server and parked
   * there is durable server-side with its payload (§B.7), so discarding the
   * local copy does not discard the record. That is deliberate — it is why a
   * lost tablet cannot take a production record with it.
   */
  async discard(key: string): Promise<void> {
    await this.store.delete(key);
    await this.notify();
  }

  private async notify() {
    if (this.listeners.size === 0) return;
    const snapshot = await this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

let singleton: OfflineQueue | null = null;

/** One queue per tab. Phases 11 and 13 share it rather than each making their own. */
export function getOfflineQueue(): OfflineQueue {
  if (!singleton) singleton = new OfflineQueue();
  return singleton;
}

/** Replay on reconnect, and on a timer while online. Returns an unsubscribe. */
export function startAutoReplay(queue: OfflineQueue, intervalMs = 30_000): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const run = () => void queue.replay();
  window.addEventListener('online', run);
  const timer = window.setInterval(() => {
    if (navigator.onLine) run();
  }, intervalMs);
  run();
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(timer);
  };
}
