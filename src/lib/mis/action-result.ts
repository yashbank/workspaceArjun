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

/** Run a server function; a thrown business error becomes `{ ok: false, detail }`. */
export async function asResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (isForbidden(error)) throw error;
    return { ok: false, detail: error instanceof Error && error.message ? error.message : 'That did not save. Try again.' };
  }
}

/** Client side: turn a refused result back into a thrown Error so an existing `catch` shows `detail`. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}
