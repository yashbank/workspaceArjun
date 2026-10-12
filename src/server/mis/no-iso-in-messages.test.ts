/**
 * An ISO timestamp ("2026-09-20T12:34:00.000Z") in a message a person reads is unreadable and in UTC. Messages
 * use `friendlyWhen` with the factory timezone. This scans `src/server/mis/**` for `toISOString()` inside a
 * `throw` / `new Error(` statement or inside a message template that feeds one. The allow-list holds the two
 * known offenders until C6b fixes them; C6b must delete the entries (the test also fails if an allow-listed
 * file no longer offends).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src/server/mis');
const ALLOW_LIST = new Set(['line-clearance.ts', 'machines-board.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

/** Statements that throw / build an Error, or a sentence-like template, containing toISOString(). */
function offendingStatements(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:\bthrow\b|\bnew\s+\w*Error\s*\()[^;]*?;/g)) {
    if (m[0].includes('toISOString(')) out.push(m[0].trim());
  }
  // A message template built outside the throw: a backtick string with a prose sentence (ends in a full stop
  // or contains "expired at"/"already") that interpolates toISOString().
  for (const m of source.matchAll(/`[^`]*\$\{[^}]*toISOString\([^}]*\}[^`]*`/g)) {
    if (/expired at|already|\.`$/.test(m[0])) out.push(m[0].trim());
  }
  return out;
}

const offends = (file: string) => offendingStatements(readFileSync(file, 'utf8')).length > 0;

describe('no ISO timestamps in server messages', () => {
  it('the scanner flags the shapes it must', () => {
    expect(offendingStatements('throw new Error(`at ${d.toISOString()}`);')).toHaveLength(1);
    expect(offendingStatements('const e = new Error(`from ${a.toISOString()} to ${b.toISOString()}`);')).toHaveLength(1);
    expect(offendingStatements('const m = `${n} expired at ${s?.toISOString() ?? "x"}.`;')).toHaveLength(1);
    expect(offendingStatements('const ref = `Receipt ${new Date().toISOString().slice(0, 10)}`;')).toHaveLength(0);
  });

  it('only allow-listed files use toISOString() in a throw / Error message', () => {
    const unexpected = walk(ROOT).filter(offends).map((f) => relative(ROOT, f)).filter((f) => !ALLOW_LIST.has(f));
    expect(unexpected, `use friendlyWhen(date, tz) instead of toISOString() in: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('every allow-list entry still offends (delete it once fixed)', () => {
    for (const f of ALLOW_LIST) expect(offends(join(ROOT, f)), `${f} no longer offends; delete it from ALLOW_LIST`).toBe(true);
  });
});
