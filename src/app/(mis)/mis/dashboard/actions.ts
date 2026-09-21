'use server';

import { revalidatePath } from 'next/cache';

import { flowLayout, type PlacedWidget } from '@/lib/mis/widgets';
import { isMisForbiddenError } from '@/server/mis/auth';
import { resetDashboardLayout, saveDashboardLayout } from '@/server/mis/dashboard';

/**
 * Outcomes are returned as values, not thrown: React replaces a thrown server-action error
 * with a generic message in production builds, so "you may not place that widget" would
 * never reach the person who needs to read it (the Phase 11 lesson, repeated in the device
 * actions). Only errors written for a person become an outcome; anything unexpected stays
 * an exception rather than leaking internals.
 */
export type LayoutActionResult =
  | { ok: true; layout: PlacedWidget[] }
  | { ok: false; detail: string };

async function outcome(run: () => Promise<PlacedWidget[]>): Promise<LayoutActionResult> {
  try {
    const layout = await run();
    revalidatePath('/mis/dashboard');
    return { ok: true, layout };
  } catch (error) {
    if (isMisForbiddenError(error)) {
      return { ok: false, detail: 'That widget is not available to your role.' };
    }
    throw error;
  }
}

/**
 * Save the person's own arrangement.
 *
 * The browser sends an ORDER, not geometry. The grid is recomputed here from the widget
 * library, so a layout cannot be talked into overlapping or into a size the library does not
 * give that widget by posting different numbers — and the role check inside
 * `saveDashboardLayout` still refuses a widget this person may not hold (D24).
 */
export async function saveDashboardLayoutAction(widgetKeys: string[]): Promise<LayoutActionResult> {
  // Flowed unrestricted so that a widget the caller may not hold still reaches
  // `saveDashboardLayout`, which REFUSES the whole layout rather than quietly dropping it
  // (D24). Filtering here instead would turn a refusal into a silent omission.
  return outcome(() => saveDashboardLayout(flowLayout(widgetKeys, 'OWNER')));
}

/** D2: "Reset is always available." */
export async function resetDashboardLayoutAction(): Promise<LayoutActionResult> {
  return outcome(() => resetDashboardLayout());
}
