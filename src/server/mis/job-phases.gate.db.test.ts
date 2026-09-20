import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The database half of the gate — MIS-146's "a direct SQL insert cannot skip it
 * either". Everything else tests the server module; nothing tested the trigger,
 * and an untripped constraint is an assumption rather than a defence.
 *
 * Safety: the whole file runs inside ONE transaction that is rolled back in
 * `afterAll` and never committed, and every test brackets itself in a SAVEPOINT
 * — Postgres aborts a transaction at the first error until you roll back to a
 * savepoint, and these tests raise errors on purpose. Nothing is ever written.
 *
 * Skips cleanly with no database URL, so `pnpm vitest run` stays green on a
 * machine that has no database.
 */

const dotenv = await import('dotenv');
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const CONNECTION = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';

type Client = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
};

let pool: { connect: () => Promise<Client>; end: () => Promise<void> };
let client: Client;
let orderId: string;
let processIds: string[] = [];

const q = (sql: string, values?: unknown[]) => client.query(sql, values);

/** Insert a phase row directly, bypassing the server module entirely. */
async function insertPhase(sequence: number, status: string, extra: Record<string, string> = {}) {
  const columns = ['order_id', 'process_id', 'sequence', 'status', ...Object.keys(extra)];
  const values = [
    orderId,
    processIds[(sequence - 1) % processIds.length],
    sequence,
    status,
    ...Object.values(extra),
  ];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await q(
    `INSERT INTO mis_job_phases (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  );
  return rows[0].id as string;
}

async function expectRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the database to reject this write, and it did not');
}

const now = () => new Date().toISOString();
const SOMEONE = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!CONNECTION)('the database defence on mis_job_phases (MIS-146)', () => {
  beforeAll(async () => {
    const { Pool } = await import('pg');
    pool = new Pool({
      connectionString: CONNECTION.replace(/[?&]sslmode=[^&]*/g, ''),
      ssl: { rejectUnauthorized: false },
    }) as unknown as typeof pool;
    client = await pool.connect();
    await q('BEGIN');

    const procs = await q(
      'SELECT id FROM mis_processes WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 3',
    );
    processIds = procs.rows.map((r) => r.id as string);

    const order = await q(
      `INSERT INTO mis_orders (order_number, status, description, updated_at)
       VALUES ($1, 'IN_PRODUCTION', 'rolled back by the test suite', now()) RETURNING id`,
      [`ZZ-GATE-TEST-${Date.now()}`],
    );
    orderId = order.rows[0].id as string;
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    // Nothing this file did is kept. This is the only exit.
    await q('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  });

  beforeEach(() => q('SAVEPOINT sp'));
  afterEach(() => q('ROLLBACK TO SAVEPOINT sp'));

  describe('mis_job_phase_gate — the sequential rule', () => {
    it('refuses to start a phase while the one before it is unsigned', async () => {
      await insertPhase(1, 'PENDING');
      const second = await insertPhase(2, 'PENDING');

      const message = await expectRejection(() =>
        q(`UPDATE mis_job_phases SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1`, [second]),
      );

      expect(message).toContain('mis_job_phase_gate');
      expect(message).toContain('cannot start until sequence 1 is signed off');
      expect(message).toContain('PENDING');
    });

    it('refuses a direct INSERT that arrives already running — the bulk-import path', async () => {
      await insertPhase(1, 'PENDING');
      const message = await expectRejection(() =>
        insertPhase(2, 'IN_PROGRESS', { started_at: now() }),
      );
      expect(message).toContain('mis_job_phase_gate');
    });

    it('allows the next phase once the one before it is signed off', async () => {
      await insertPhase(1, 'SIGNED_OFF', {
        started_at: now(),
        signed_off_at: now(),
        signed_off_by_id: SOMEONE,
      });
      const second = await insertPhase(2, 'PENDING');

      await expect(
        q(`UPDATE mis_job_phases SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1`, [second]),
      ).resolves.toBeTruthy();
    });

    it('does not let a skipped phase block the sequence', async () => {
      await insertPhase(1, 'NOT_APPLICABLE', { not_applicable_reason: 'not on this job card' });
      const second = await insertPhase(2, 'PENDING');

      await expect(
        q(`UPDATE mis_job_phases SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1`, [second]),
      ).resolves.toBeTruthy();
    });

    it('treats REOPENED as unsigned, so it blocks the next phase', async () => {
      await insertPhase(1, 'REOPENED', {
        started_at: now(),
        reopen_reason: 'shade drifted',
        reopened_at: now(),
      });
      const second = await insertPhase(2, 'PENDING');

      const message = await expectRejection(() =>
        q(`UPDATE mis_job_phases SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1`, [second]),
      );

      expect(message).toContain('mis_job_phase_gate');
      expect(message).toContain('REOPENED');
    });
  });

  describe('the CHECK constraints and the partial unique index', () => {
    it('refuses a signature with no signer', async () => {
      const message = await expectRejection(() =>
        insertPhase(1, 'SIGNED_OFF', { started_at: now() }),
      );
      expect(message).toContain('mis_job_phases_signed_off_evidence_check');
    });

    it('refuses a skip with no reason', async () => {
      const message = await expectRejection(() => insertPhase(1, 'NOT_APPLICABLE'));
      expect(message).toContain('mis_job_phases_not_applicable_reason_check');
    });

    it('refuses a reopen with no reason', async () => {
      const message = await expectRejection(() =>
        insertPhase(1, 'REOPENED', { started_at: now(), reopened_at: now() }),
      );
      expect(message).toContain('mis_job_phases_reopen_reason_check');
    });

    it('refuses two phases at the same position on one order', async () => {
      await insertPhase(1, 'PENDING');
      const message = await expectRejection(() => insertPhase(1, 'PENDING'));
      expect(message).toContain('mis_job_phases_order_sequence_key');
    });
  });
});
