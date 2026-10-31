import { describe, expect, it } from 'vitest';

import { DEFAULT_QC_TEMPLATES, buildChecklist, filterChecksToFactoryDay, moveItem } from './qc-template';

describe('spec wording (V2 Epic 5)', () => {
  it('the preloaded forms carry the spec parameters exactly', () => {
    expect(DEFAULT_QC_TEMPLATES.map((t) => t.parameters)).toEqual([
      ['Shade Matching with Shade Card', 'Unwanted Marks/Blanket Punch', 'Front Lay & Side Lay', 'Scumming', 'Registration Out', 'Set-Off/Powdering'],
      ['Type of Lamination (Gloss/Matt)', 'Bubbles', 'Wrinkles', 'Powder/White Patches', 'Scratches on Film'],
      ['Gripper and Side Lay', 'Moisture', 'Bubbles', 'Fiber Tear Test', 'Sheets Sticking to Each Other'],
      ['Box Dimensions (±0.5mm)', 'Cracking', 'Burrs/Rough Edges', 'Clean and Easy Stripping', 'Punching Out & Embossing Out'],
    ]);
  });
});

describe('moveItem', () => {
  it('swaps with the neighbour and is a no-op at either end', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 'up')).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 'down')).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a'], 5, 'up')).toEqual(['a']);
  });
});

describe('filterChecksToFactoryDay', () => {
  const IST = 'Asia/Kolkata';
  // 18:20 UTC on the 9th is 23:50 IST that night; 18:40 UTC is 00:10 IST on the 10th.
  const lateNight = { checkTime: new Date('2026-10-09T18:20:00Z') };
  const afterMidnight = { checkTime: new Date('2026-10-09T18:40:00Z') };
  const yesterday10 = { checkTime: new Date('2026-10-09T04:30:00Z') }; // 10:00 IST on the 9th
  it('splits a night shift at factory midnight, not server or UTC midnight', () => {
    const all = [lateNight, afterMidnight, yesterday10];
    expect(filterChecksToFactoryDay(all, '2026-10-09', IST)).toEqual([lateNight, yesterday10]);
    expect(filterChecksToFactoryDay(all, '2026-10-10', IST)).toEqual([afterMidnight]);
  });
  it("yesterday's 10:00 tap does not fill today's 10:00 cell", () => {
    const tap = { parameterName: 'Shade', slotTime: '10:00', result: 'PASS', defectType: null, ...yesterday10 };
    expect(buildChecklist(['Shade'], ['10:00'], [tap])[0].cells[0].status).toBe('PASS'); // the old bug
    expect(buildChecklist(['Shade'], ['10:00'], filterChecksToFactoryDay([tap], '2026-10-10', IST))[0].cells[0].status).toBeNull();
  });
});

describe('R2-312 a night shift keeps one sheet across midnight', () => {
  const IST = 'Asia/Kolkata';
  const night = { startTime: '19:00', endTime: '07:00' };
  const evening = { checkTime: new Date('2026-10-09T15:30:00Z') }; // 21:00 IST on the 9th
  const afterMidnight = { checkTime: new Date('2026-10-09T18:40:00Z') }; // 00:10 IST on the 10th
  const nextMorning = { checkTime: new Date('2026-10-10T04:30:00Z') }; // 10:00 IST on the 10th: the day shift
  it('with the running shift given, the 00:10 tap stays on the sheet the shift started on', () => {
    expect(filterChecksToFactoryDay([evening, afterMidnight, nextMorning], '2026-10-09', IST, night)).toEqual([evening, afterMidnight]);
    expect(filterChecksToFactoryDay([evening, afterMidnight, nextMorning], '2026-10-10', IST, night)).toEqual([nextMorning]);
  });
  it('a day shift (no wrap) and no shift at all behave as the calendar day', () => {
    expect(filterChecksToFactoryDay([evening, afterMidnight], '2026-10-10', IST, { startTime: '06:00', endTime: '14:00' })).toEqual([afterMidnight]);
    expect(filterChecksToFactoryDay([evening, afterMidnight], '2026-10-10', IST, null)).toEqual([afterMidnight]);
  });
});
