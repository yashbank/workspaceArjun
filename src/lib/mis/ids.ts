/**
 * Is this a well-formed UUID? A `[id]` route parameter is whatever was typed in the address bar. Handed straight to a
 * `@db.Uuid` column, "none" or "abc" makes the database refuse the query ("invalid input syntax for type uuid") and the
 * person sees "Something went wrong" instead of "not found" (F-25). A page checks this first and answers 404.
 *
 * Pure: no Prisma, no React.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
