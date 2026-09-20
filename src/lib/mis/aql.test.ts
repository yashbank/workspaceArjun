import { describe, expect, it } from 'vitest';

import { evaluateAql, type AqlThresholds } from './aql';

const thresholds: AqlThresholds = {
  sampleSize: 32,
  criticalMax: 0,
  majorMax: 2,
  minorMax: 5,
};

describe('evaluateAql', () => {
  it('accepts a sample with zero defects', () => {
    const result = evaluateAql(32, { critical: 0, major: 0, minor: 0 }, thresholds);
    expect(result.decision).toBe('ACCEPT');
    expect(result.breakdown.every((line) => !line.exceeded)).toBe(true);
  });

  it('accepts a sample exactly at the critical threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 0, minor: 0 }, thresholds);
    expect(result.decision).toBe('ACCEPT');
  });

  it('accepts a sample exactly at the major threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 2, minor: 0 }, thresholds);
    expect(result.decision).toBe('ACCEPT');
    expect(result.breakdown.find((l) => l.severity === 'MAJOR')?.exceeded).toBe(false);
  });

  it('accepts a sample exactly at the minor threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 0, minor: 5 }, thresholds);
    expect(result.decision).toBe('ACCEPT');
    expect(result.breakdown.find((l) => l.severity === 'MINOR')?.exceeded).toBe(false);
  });

  it('rejects a sample one over the critical threshold', () => {
    const result = evaluateAql(32, { critical: 1, major: 0, minor: 0 }, thresholds);
    expect(result.decision).toBe('REJECT');
    expect(result.breakdown.find((l) => l.severity === 'CRITICAL')?.exceeded).toBe(true);
  });

  it('rejects a sample one over the major threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 3, minor: 0 }, thresholds);
    expect(result.decision).toBe('REJECT');
    expect(result.breakdown.find((l) => l.severity === 'MAJOR')?.exceeded).toBe(true);
  });

  it('rejects a sample one over the minor threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 0, minor: 6 }, thresholds);
    expect(result.decision).toBe('REJECT');
    expect(result.breakdown.find((l) => l.severity === 'MINOR')?.exceeded).toBe(true);
  });

  it('rejects on mixed severities where only some exceed their threshold', () => {
    const result = evaluateAql(32, { critical: 0, major: 3, minor: 1 }, thresholds);
    expect(result.decision).toBe('REJECT');
    const bySeverity = Object.fromEntries(result.breakdown.map((l) => [l.severity, l.exceeded]));
    expect(bySeverity.CRITICAL).toBe(false);
    expect(bySeverity.MAJOR).toBe(true);
    expect(bySeverity.MINOR).toBe(false);
  });

  it('flags an undersized sample without treating it as a rejection reason', () => {
    const result = evaluateAql(10, { critical: 0, major: 0, minor: 0 }, thresholds);
    expect(result.sampleSizeMet).toBe(false);
    expect(result.decision).toBe('ACCEPT');
  });

  it('an undersized sample can still reject on defects', () => {
    const result = evaluateAql(10, { critical: 1, major: 0, minor: 0 }, thresholds);
    expect(result.sampleSizeMet).toBe(false);
    expect(result.decision).toBe('REJECT');
  });

  it('echoes the thresholds it was given, unchanged', () => {
    const result = evaluateAql(32, { critical: 0, major: 0, minor: 0 }, thresholds);
    expect(result.thresholds).toEqual(thresholds);
    expect(result.sampleSizeRequired).toBe(32);
  });
});
