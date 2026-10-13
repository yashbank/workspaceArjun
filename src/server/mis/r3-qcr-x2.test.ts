/**
 * R3-QCR X2: no browser-locale formatting (`toLocale*`) in the QC / reports / CoA / checklist-print surfaces.
 * Time is the factory's (`factory-time.ts`), never the browser's or the server's locale.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = [
  'src/components/mis/qc',
  'src/components/mis/reports',
  'src/app/(mis)/mis/print/coa',
  'src/app/(mis)/mis/print/qc-checklist',
  'src/app/(mis)/mis/reports',
  'src/app/(mis)/mis/qc',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('X2 no toLocale* in the QCR surfaces', () => {
  for (const root of ROOTS) {
    it(root, () => {
      const offenders = sourceFiles(join(process.cwd(), root)).filter((f) => /toLocale\w*\(/.test(readFileSync(f, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});
