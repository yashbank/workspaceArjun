import { describe, expect, it } from 'vitest';

import { DEFAULT_QC_TEMPLATES, buildChecklist, checkToChecklistStatus, checklistStatusToCheck, parseParameters, slotTimes } from './qc-template';

describe('slotTimes', () => {
  it('09:15 to 18:00 is the first check then every hour on the hour through 18:00', () => {
    expect(slotTimes('09:15', '18:00')).toEqual(['09:15', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
  });
  it('a start on the hour is not doubled; a bad time or a backwards range is refused', () => {
    expect(slotTimes('09:00', '11:00')).toEqual(['09:00', '10:00', '11:00']);
    expect(() => slotTimes('9:15', '18:00')).toThrow(/HH:MM/);
    expect(() => slotTimes('18:00', '09:15')).toThrow(/before/);
  });
});

describe('the four buttons map onto the result QC already reads', () => {
  it.each([
    ['PASS', { result: 'PASS' }],
    ['FAIL', { result: 'FAIL' }],
    ['PLATE_ERR', { result: 'FAIL', defectType: 'PLATE_ERR' }],
    ['MAKE_READY', { result: 'NA' }],
  ] as const)('%s', (status, check) => {
    expect(checklistStatusToCheck(status)).toEqual(check);
    expect(checkToChecklistStatus({ result: check.result, defectType: 'defectType' in check ? check.defectType : null })).toBe(status);
  });
});

describe('defaults and parsing', () => {
  it('ships the four paper forms, each with slots 09:15–18:00 and some parameters', () => {
    expect(DEFAULT_QC_TEMPLATES.map((t) => t.name)).toEqual(['Printing 6-Colours', 'Lamination', 'Lamif Flute', 'Die Cutting']);
    for (const t of DEFAULT_QC_TEMPLATES) expect(t.parameters.length).toBeGreaterThan(3);
  });
  it('parseParameters tolerates junk', () => {
    expect(parseParameters(['a', ' b ', '', 3])).toEqual(['a', 'b', '3']);
    expect(parseParameters('nope')).toEqual([]);
  });
});

describe('buildChecklist', () => {
  it('the latest tap wins a cell; untouched cells are null', () => {
    const t = (h: number) => new Date(2026, 9, 9, h);
    const rows = buildChecklist(['Shade'], ['09:15', '10:00'], [
      { parameterName: 'Shade', slotTime: '09:15', result: 'FAIL', defectType: null, checkTime: t(9) },
      { parameterName: 'Shade', slotTime: '09:15', result: 'PASS', defectType: null, checkTime: t(10) },
    ]);
    expect(rows[0].cells).toEqual([{ slot: '09:15', status: 'PASS', checks: 2 }, { slot: '10:00', status: null, checks: 0 }]);
  });
});
