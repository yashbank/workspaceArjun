import { revalidatePath } from 'next/cache';

/**
 * R2-407: the desktop dashboard reads orders, production, BOM approvals, GRN and stock, but
 * mutations only revalidated their own screens, so the dashboard stayed on the client Router
 * Cache for its stale window. Call this once from the main mutation actions.
 */
export function revalidateDashboard(): void {
  revalidatePath('/mis/dashboard');
}
