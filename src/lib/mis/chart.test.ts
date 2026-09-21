/**
 * Phase 24 · D1 — the chart rules, as arithmetic.
 *
 * The three the artboard is emphatic about: one scale and one axis, series hues that are
 * computed and colour-blind separable, and green/amber/red reserved for state.
 */
import { describe, expect, it } from 'vitest';

import {
  SERIES_HUES,
  STATE_HUES,
  axisTicks,
  axisTop,
  barGeometry,
  compactTick,
  seriesHue,
  sparklinePath,
  valueToY,
} from './chart';

/** Rec 709 relative luminance, for the separation check below. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('the palette', () => {
  it('is D1\'s five computed hues, in order', () => {
    expect(SERIES_HUES).toEqual(['#4338ca', '#0e8ba8', '#b02a63', '#9a6320', '#7b3fb5']);
  });

  it('holds no duplicate, and every hue is a full six-digit hex', () => {
    expect(new Set(SERIES_HUES).size).toBe(SERIES_HUES.length);
    for (const hue of SERIES_HUES) expect(hue).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reserves green, amber and red for STATE — no series is ever coloured green', () => {
    const state = Object.values(STATE_HUES) as string[];
    for (const hue of SERIES_HUES) expect(state).not.toContain(hue);
  });

  it('no series hue reads as green: on every one, green is not the dominant channel', () => {
    for (const hue of SERIES_HUES) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hue.slice(i, i + 2), 16));
      expect(g, `${hue} is greenish`).toBeLessThanOrEqual(Math.max(r, b));
    }
  });

  it('every adjacent pair separates by luminance, which is what survives colour blindness', () => {
    for (let i = 1; i < SERIES_HUES.length; i += 1) {
      const gap = Math.abs(luminance(SERIES_HUES[i]) - luminance(SERIES_HUES[i - 1]));
      expect(gap, `${SERIES_HUES[i - 1]} vs ${SERIES_HUES[i]}`).toBeGreaterThan(0.01);
    }
  });

  it('cycles rather than running out, so a sixth series is still drawable', () => {
    expect(seriesHue(0)).toBe(SERIES_HUES[0]);
    expect(seriesHue(5)).toBe(SERIES_HUES[0]);
    expect(seriesHue(7)).toBe(SERIES_HUES[2]);
  });
});

describe('axisTicks — the one scale', () => {
  it('always starts at zero: a bar chart that does not misstates every comparison it draws', () => {
    for (const max of [1, 9, 47, 40850, 0.4]) expect(axisTicks(max)[0]).toBe(0);
  });

  it('reaches at or above the value it has to hold', () => {
    for (const max of [1, 9, 47, 999, 40850]) {
      const ticks = axisTicks(max);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it('is evenly spaced', () => {
    const ticks = axisTicks(40850);
    const step = ticks[1] - ticks[0];
    for (let i = 1; i < ticks.length; i += 1) {
      expect(Math.round((ticks[i] - ticks[i - 1]) * 1e6) / 1e6).toBe(step);
    }
  });

  it('picks the round numbers D1 shows for its output chart', () => {
    expect(axisTicks(40850)).toEqual([0, 12000, 24000, 36000, 48000]);
  });

  it('survives nothing, zero and nonsense rather than drawing an infinite axis', () => {
    expect(axisTicks(0)).toEqual([0]);
    expect(axisTicks(-5)).toEqual([0]);
    expect(axisTicks(Number.NaN)).toEqual([0]);
  });

  it('axisTop includes the plan line, so a plan above every bar is still on the chart', () => {
    expect(axisTop([10, 20, 30])).toBeGreaterThanOrEqual(30);
    expect(axisTop([10, 20, 30], 400)).toBeGreaterThanOrEqual(400);
  });
});

describe('compactTick', () => {
  it.each([
    [0, '0'],
    [900, '900'],
    [12000, '12k'],
    [48000, '48k'],
    [1500, '1.5k'],
    [2_400_000, '2.4m'],
  ])('%i → %s', (value, label) => {
    expect(compactTick(value)).toBe(label);
  });
});

describe('barGeometry — one scale shared by every bar', () => {
  const box = { width: 400, height: 200 };

  it('scales every bar against the SAME top, so two bars are comparable by height', () => {
    const bars = barGeometry([50, 100], box, { top: 100 });
    expect(bars[1].height).toBeCloseTo(bars[0].height * 2);
    expect(bars[1].height).toBeCloseTo(200);
  });

  it('keeps every bar inside the box, and sits them on the floor', () => {
    for (const bar of barGeometry([3, 47, 21], box)) {
      expect(bar.y).toBeGreaterThanOrEqual(0);
      expect(bar.y + bar.height).toBeCloseTo(box.height);
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(box.width + 0.01);
    }
  });

  it('gives equal slots and a stable order', () => {
    const bars = barGeometry([1, 2, 3, 4], box);
    expect(bars.map((b) => b.index)).toEqual([0, 1, 2, 3]);
    const slots = bars.slice(1).map((b, i) => b.x - bars[i].x);
    for (const gap of slots) expect(gap).toBeCloseTo(100);
  });

  it('draws nothing for a negative or non-finite value rather than a bar below the floor', () => {
    const bars = barGeometry([-5, Number.NaN, 10], box, { top: 10 });
    expect(bars[0].height).toBe(0);
    expect(bars[1].height).toBe(0);
    expect(bars[2].height).toBeCloseTo(200);
  });

  it('returns nothing for no data, rather than one bar of width Infinity', () => {
    expect(barGeometry([], box)).toEqual([]);
  });

  it('valueToY puts the plan line on the same scale as the bars — that is what one axis means', () => {
    const top = 100;
    const bars = barGeometry([100], { width: 10, height: 200 }, { top });
    expect(valueToY(100, top, 200)).toBeCloseTo(bars[0].y);
    expect(valueToY(0, top, 200)).toBeCloseTo(200);
  });
});

describe('sparklinePath — the degradation, not a second chart', () => {
  const box = { width: 100, height: 20 };

  it('draws one point per value, in the order given', () => {
    const d = sparklinePath([1, 2, 3], box);
    expect(d.startsWith('M0,')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(2);
  });

  it('spans the full width, so the last reading is at the right edge', () => {
    expect(sparklinePath([1, 5, 2, 9], box)).toContain('L100');
  });

  it('holds a flat series in the middle, not along the floor where it reads as zero', () => {
    const d = sparklinePath([7, 7, 7], box);
    expect(d).toBe('M0,10L50,10L100,10');
  });

  it('produces only finite numbers for every shape of input', () => {
    for (const values of [[1], [0, 0], [1, 2, 3], [-4, 8], [1e9, 1]]) {
      const d = sparklinePath(values, box);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('is empty for no data — the widget shows its empty state instead of a stray mark', () => {
    expect(sparklinePath([], box)).toBe('');
    expect(sparklinePath([Number.NaN], box)).toBe('');
  });
});
