/**
 * A server action's outcome, as DATA.
 *
 * In a production build Next.js replaces a thrown error's message with "An error occurred in the
 * Server Components render…" before it reaches the browser, so a refusal such as "Cannot issue
 * more than is allocated to this order" arrived as that sentence (found by the live V2 chain
 * test). Appendix B §B.10.3 already says a refusal comes back as a value, never a throw —
 * `orders/actions.ts#reopenOrderAction` is the precedent; this is the general form.
 *
 * A permission refusal (MisForbiddenError, identified by its `digest`) is still thrown: the
 * (mis) error boundary owns that page.
 *
 * Pure: no Prisma, no React.
 */

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; detail: string };

const MIS_FORBIDDEN_DIGEST = 'MIS_FORBIDDEN';
const isForbidden = (e: unknown) => (e as { digest?: string } | null)?.digest === MIS_FORBIDDEN_DIGEST;

const FALLBACK_DETAIL = 'That did not save. Try again.';

export type PrismaErrorContext = {
  /** What was being saved, e.g. "Supplier". */
  entity: string;
  /** The submitted values by field name; used to quote the clashing value in a duplicate message. */
  fields?: Record<string, unknown>;
};

type PrismaLike = Error & { code: string; meta?: { target?: unknown } };

/** Duck-typed (this file stays free of Prisma imports): a known-request error carries a `P####` code. */
function isPrismaError(e: unknown): e is PrismaLike {
  return e instanceof Error && typeof (e as { code?: unknown }).code === 'string' && /^P\d{4}$/.test((e as PrismaLike).code);
}

/**
 * A friendly sentence for a Prisma constraint error. P2002 (unique) names the entity, the field(s) from
 * `meta.target` and, when `fields` supplies it, the value; P2003 (foreign key) says the record is in use.
 * Any other error keeps its own message.
 */
export function mapPrismaError(error: unknown, ctx: PrismaErrorContext): string {
  const own = error instanceof Error && error.message ? error.message : FALLBACK_DETAIL;
  if (!isPrismaError(error)) return own;
  if (error.code === 'P2002') {
    const target = error.meta?.target;
    const names = (Array.isArray(target) ? target : typeof target === 'string' ? [target] : []).map(String);
    // A constraint name such as "MisSupplier_code_key" -> "code"; a column list stays as the columns.
    const cleaned = names.map((n) => (n.endsWith('_key') ? (n.split('_').slice(-2, -1)[0] ?? n) : n));
    if (cleaned.length === 0) return `${ctx.entity} already exists`;
    const parts = cleaned.map((f) => {
      const v = ctx.fields?.[f];
      return v === undefined || v === null || v === '' ? f : `${f} '${String(v)}'`;
    });
    return `${ctx.entity} with ${parts.join(' and ')} already exists`;
  }
  if (error.code === 'P2003') return 'Cannot change this: it is used elsewhere';
  return own;
}

/**
 * Run a server function; a thrown business error becomes `{ ok: false, detail }`. A Prisma constraint error
 * (P2002/P2003) gets a friendly sentence via `mapPrismaError`; `ctx` names the entity (default "Record").
 */
export async function asResult<T>(run: () => Promise<T>, ctx: PrismaErrorContext = { entity: 'Record' }): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (isForbidden(error)) throw error;
    if (isPrismaError(error)) return { ok: false, detail: mapPrismaError(error, ctx) };
    return { ok: false, detail: error instanceof Error && error.message ? error.message : FALLBACK_DETAIL };
  }
}

/** Client side: turn a refused result back into a thrown Error so an existing `catch` shows `detail`. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}
