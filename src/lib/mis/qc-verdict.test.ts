import { describe, expect, it } from 'vitest';

import { latestVerdict } from './qc-verdict';

const at = (hhmm: string) => new Date(`2026-09-05T${hhmm}:00+05:30`);
const chk = (result: string, hhmm: string, parameterName = 'Shade', bomStageId: string | null = null) => ({ result, checkTime: at(hhmm), parameterName, bomStageId });

describe('latestVerdict (R3-QCR B74)', () => {
  it('a FAIL at 09:15 followed by a PASS at 10:15 on the same parameter is resolved: PASS', () => {
    expect(latestVerdict([chk('FAIL', '09:15'), chk('PASS', '10:15')]).overall).toBe('PASS');
  });

  it('order of the input does not matter, only the time', () => {
    expect(latestVerdict([chk('PASS', '10:15'), chk('FAIL', '09:15')]).overall).toBe('PASS');
  });

  it('a FAIL on parameter A with a PASS on parameter B is still FAIL', () => {
    const v = latestVerdict([chk('FAIL', '09:15', 'A'), chk('PASS', '10:15', 'B')]);
    expect(v.overall).toBe('FAIL');
    expect(v.unresolvedFailures).toHaveLength(1);
  });

  it('the same parameter on a different stage is a different key', () => {
    expect(latestVerdict([chk('FAIL', '09:15', 'Shade', 's1'), chk('PASS', '10:15', 'Shade', 's2')]).overall).toBe('FAIL');
  });

  it('a later FAIL after a PASS is FAIL', () => {
    expect(latestVerdict([chk('PASS', '09:15'), chk('FAIL', '10:15')]).overall).toBe('FAIL');
  });

  it('all N/A is N/A, and no checks is N/A', () => {
    expect(latestVerdict([chk('NA', '09:15')]).overall).toBe('NA');
    expect(latestVerdict([]).overall).toBe('NA');
  });

  it('AQL Sample checks follow the same rule', () => {
    expect(latestVerdict([chk('FAIL', '09:00', 'AQL Sample'), chk('PASS', '11:00', 'AQL Sample')]).overall).toBe('PASS');
  });
});
