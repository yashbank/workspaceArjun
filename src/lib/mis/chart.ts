/**
 * Chart maths and the palette — D1.
 *
 * Pure: no React, no SVG. The geometry is separable from the drawing, so the rules that
 * matter can be tested as arithmetic rather than by reading a picture.
 *
 * Three rules from the artboard, and each is a test in `chart.test.ts`:
 *
 * - **One scale, one axis, never two.** "Output and plan share the y-axis because they
 *   share a unit. Wastage is Kg, so it is a separate chart — not a second line on this one.
 *   A dual-axis chart can be made to show any relationship you like, which is why it shows
 *   nothing." So a chart is built from ONE unit and one scale; there is no second axis to
 *   pass, deliberately.
 * - **The series hues are computed, not chosen**, and pass a colour-blind separation check.
 * - **Green, amber and red stay reserved for state.** "A series is never coloured green
 *   here, or 'good' stops meaning anything."
 */

/** D1's series palette, in order. A chart takes hues from the front. */
export const SERIES_HUES = ['#4338ca', '#0e8ba8', '#b02a63', '#9a6320', '#7b3fb5'] as const;

/**
 * Reserved for state, never for a series: green is healthy, amber is at risk, red is
 * stopped. These are the tones the card vocabulary in MIS_UI_SPEC §4.2 already uses.
 */
export const STATE_HUES = { good: '#16a34a', warn: '#d97706', bad: '#dc2626' } as const;

export function seriesHue(index: number): string {
  return SERIES_HUES[index % SERIES_HUES.length];
}

const NICE_STEPS = [1, 1.2, 2, 2.5, 5, 10] as const;

/**
 * Round a maximum up to a readable axis top, and give the ticks for it.
 *
 * Always includes zero: a bar chart that does not start at zero misstates every comparison
 * it draws, which is the one thing a bar chart is for.
 */
export function axisTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  // 1.2 and 2.5 are in the family because the artboard's own axis uses them: D1's output
  // chart tops out at 48k in steps of 12k for a 40,850 reading, which a plain 1/2/5 family
  // cannot produce (it would jump to 20k and waste a third of the height).
  const niceStep = (NICE_STEPS.find((step) => normalised <= step) ?? 10) * magnitude;
  const top = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = 0; value <= top + niceStep / 2; value += niceStep) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

/** The top of the axis for a set of values — the last tick. */
export function axisTop(values: readonly number[], plan?: number): number {
  const highest = Math.max(0, ...values, plan ?? 0);
  const ticks = axisTicks(highest);
  return ticks[ticks.length - 1] || 1;
}

/** A short, readable form for an axis label: 48k rather than 48,000. */
export function compactTick(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1_000_000) return `${trimZero(value / 1_000_000)}m`;
  if (Math.abs(value) >= 1_000) return `${trimZero(value / 1_000)}k`;
  return trimZero(value);
}

function trimZero(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export type BarGeometry = { x: number; y: number; width: number; height: number; value: number; index: number };

/**
 * Bars on a 0..`width` × 0..`height` box, one scale shared by every bar.
 *
 * `gap` is a fraction of the slot, so bars stay proportionally spaced at any size — the
 * same geometry serves the full chart and a thumbnail.
 */
export function barGeometry(
  values: readonly number[],
  box: { width: number; height: number },
  options: { top?: number; gap?: number } = {},
): BarGeometry[] {
  const top = options.top ?? axisTop(values);
  const gap = options.gap ?? 0.28;
  if (values.length === 0 || top <= 0) return [];

  const slot = box.width / values.length;
  const barWidth = Math.max(1, slot * (1 - gap));

  return values.map((value, index) => {
    const safe = Number.isFinite(value) && value > 0 ? value : 0;
    const height = (safe / top) * box.height;
    return {
      index,
      value,
      width: barWidth,
      height,
      x: index * slot + (slot - barWidth) / 2,
      y: box.height - height,
    };
  });
}

/** The y for a value on the same scale the bars use — so a plan line lands on the bars. */
export function valueToY(value: number, top: number, height: number): number {
  if (top <= 0) return height;
  return height - (Math.max(0, value) / top) * height;
}

/**
 * The `d` of a sparkline over `values`.
 *
 * This is the "charts degrade to sparklines" half of the two-layout rule (D1): below
 * 1024px the same numbers are drawn without axis, ticks or labels. Same data, same order,
 * less ink — never a second data path and never a different series.
 *
 * A flat series draws a flat line through the middle rather than along the floor, because a
 * line pinned to the bottom edge reads as zero when it may be a steady high number.
 */
export function sparklinePath(values: readonly number[], box: { width: number; height: number }): string {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return '';
  if (usable.length === 1) return `M0,${box.height / 2}L${box.width},${box.height / 2}`;

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min;
  const step = box.width / (usable.length - 1);

  return usable
    .map((value, index) => {
      const y = span === 0 ? box.height / 2 : box.height - ((value - min) / span) * box.height;
      return `${index === 0 ? 'M' : 'L'}${round(index * step)},${round(y)}`;
    })
    .join('');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
