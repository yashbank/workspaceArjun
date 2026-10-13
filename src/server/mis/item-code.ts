import { formatItemCode, nextItemCodeNumber } from '@/lib/mis/item-code';

type CodeReader = { misItem: { findMany: (args: { select: { code: true } }) => Promise<{ code: string }[]> } };

/**
 * The next free `ITM-` code. Reads EVERY item's code, soft-deleted included, so a deleted item's
 * number is never reused. `offset` is added on a retry after a unique-constraint clash (R3-MST B24).
 */
export async function allocateItemCode(tx: CodeReader, offset = 0): Promise<string> {
  const rows = await tx.misItem.findMany({ select: { code: true } });
  return formatItemCode(nextItemCodeNumber(rows.map((r) => r.code)) + offset);
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
