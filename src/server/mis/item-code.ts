import { formatItemCode, nextItemCodeNumber } from '@/lib/mis/item-code';

type CodeReader = {
  misItem: { findMany: (args: { select: { code: true } }) => Promise<{ code: string }[]> };
  /** R2-344: present on a real Prisma client / tx; a test fake without it falls back to reading every code. */
  $queryRaw?: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/** Highest N over codes shaped `ITM-<digits>`, soft-deleted rows included, computed in SQL (R2-344). */
async function maxItemCodeNumber(tx: CodeReader): Promise<number> {
  if (typeof tx.$queryRaw === 'function') {
    const rows = await tx.$queryRaw<{ max: number | bigint | null }[]>`
      SELECT MAX(CAST(SUBSTRING(code FROM 5) AS BIGINT)) AS max FROM "mis_items" WHERE code ~ '^ITM-[0-9]+$'`;
    return Number(rows[0]?.max ?? 0);
  }
  const rows = await tx.misItem.findMany({ select: { code: true } });
  return nextItemCodeNumber(rows.map((r) => r.code)) - 1;
}

/**
 * The next free `ITM-` code. Counts EVERY item's code, soft-deleted included, so a deleted item's
 * number is never reused. `offset` is added on a retry after a unique-constraint clash (R3-MST B24).
 */
export async function allocateItemCode(tx: CodeReader, offset = 0): Promise<string> {
  return formatItemCode((await maxItemCodeNumber(tx)) + 1 + offset);
}

const MAX_ATTEMPTS = 5;

function isUnique(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002');
}

/** Allocate a code and run `create(code)`; on P2002 try again with offset+1, up to 5 times. */
export async function createWithItemCode<T>(tx: CodeReader, create: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const code = await allocateItemCode(tx, attempt);
    try {
      return await create(code);
    } catch (err) {
      if (!isUnique(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
}
