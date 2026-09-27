/**
 * Phase 17 · MIS-162 — a hand-checked fixture for `getSignOffSummary`'s totals, so the
 * expected numbers are auditable by reading this file, not by trusting the test that runs it.
 *
 * D13: orders carry no quantity column, so "did the totals tie out" is checked against what
 * the PREVIOUS phase handed over (the BPR's own "Received Sheets → Printed Sheets" columns),
 * never against an order quantity that does not exist.
 *
 * Six entries, deliberately not round numbers, so a bug that only shows up with fractional
 * quantities (a `.toFixed()` truncation, an integer-division slip) has somewhere to hide if one
 * exists. The arithmetic below is the audit trail — check it with a calculator, not by reading
 * the code that also computes it.
 */

export const PRODUCTION_LOG_ENTRIES = [
  { qtyProduced: 342.5, qtyWaste: 7.25, unit: 'Sheets' },
  { qtyProduced: 128.75, qtyWaste: 3.5, unit: 'Sheets' },
  { qtyProduced: 500, qtyWaste: 12.25, unit: 'Sheets' },
  { qtyProduced: 89.25, qtyWaste: 1.75, unit: 'Sheets' },
  { qtyProduced: 210.5, qtyWaste: 5, unit: 'Sheets' },
  { qtyProduced: 75, qtyWaste: 0.25, unit: 'Sheets' },
] as const;

// output = 342.5 + 128.75 + 500 + 89.25 + 210.5 + 75
//        = 471.25 + 500 + 89.25 + 210.5 + 75
//        = 971.25 + 89.25 + 210.5 + 75
//        = 1060.5 + 210.5 + 75
//        = 1271 + 75
//        = 1346
const OUTPUT = 1346;

// waste = 7.25 + 3.5 + 12.25 + 1.75 + 5 + 0.25
//       = 10.75 + 12.25 + 1.75 + 5 + 0.25
//       = 23 + 1.75 + 5 + 0.25
//       = 24.75 + 5 + 0.25
//       = 29.75 + 0.25
//       = 30
const WASTE = 30;

// wastePercent = waste / (output + waste) * 100 = 30 / 1376 * 100
const WASTE_PERCENT = (WASTE / (OUTPUT + WASTE)) * 100; // 2.1802325581395348...

/** What the previous (Printing) phase handed over — three deliveries, hand-summed. */
export const PREVIOUS_PHASE_LOG_ENTRIES = [
  { qtyProduced: 500 },
  { qtyProduced: 460 },
  { qtyProduced: 400 },
] as const;
const HANDED_OVER_OUTPUT = 500 + 460 + 400; // 1360

export const EXPECTED = {
  output: OUTPUT,
  waste: WASTE,
  wastePercent: WASTE_PERCENT,
  entries: PRODUCTION_LOG_ENTRIES.length,
  unit: 'Sheets',
  handedOver: { processName: 'Printing', output: HANDED_OVER_OUTPUT },
} as const;
