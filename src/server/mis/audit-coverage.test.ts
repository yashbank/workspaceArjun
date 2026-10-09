/**
 * V2 Epic 6 — the audit trail, checked from the source.
 *
 * 1. Every exported server function that WRITES to the database (`db.x.create/update/delete…`,
 *    inside or outside a transaction) calls `logAuditEvent`, or is on the reviewed list below
 *    with the reason it need not. A new writer without an audit row turns this red.
 * 2. Audit rows are immutable: nothing in the app updates, upserts or deletes `misAuditLog`.
 *    `logAuditEvent` is the only writer and it only creates.
 * 3. `before` / `after` are real diffs on an update: every `*.update` audit action that writes a
 *    `before` also writes an `after` (a one-sided row cannot show what changed).
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { auditCallsIn, listFiles, parse, readSource } from './testing/ast';

const SERVER_FILES = listFiles('src/server/mis', /\.ts$/).filter((f) => !/\.test\.ts$/.test(f) && !f.includes('/testing/') && !f.endsWith('offline-fake-db.ts'));

const WRITES = /\b(db|tx|client)\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|updateManyAndReturn|createManyAndReturn)\(|\$executeRaw/;

/** Exported functions with their body text — the AST helper exposes calls, not property calls, so the write check reads the body. */
function exportedBodies(file: string): { name: string; body: string }[] {
  const sf = parse(file);
  const out: { name: string; body: string }[] = [];
  sf.forEachChild((node) => {
    const exported = ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return;
    if (ts.isFunctionDeclaration(node) && node.name && node.body) out.push({ name: node.name.text, body: node.body.getText() });
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) if (d.initializer && ts.isIdentifier(d.name)) out.push({ name: d.name.text, body: d.initializer.getText() });
    }
  });
  return out;
}

/** Writers that deliberately carry no audit row, each with its reason. Adding here is a review decision. */
const REVIEWED_UNAUDITED: Record<string, string> = {
  'audit.ts#logAuditEvent': 'this IS the audit writer',
  'dashboard.ts#saveDashboardLayout': "a person's own widget layout, not factory data",
  'dashboard.ts#resetDashboardLayout': "a person's own widget layout, not factory data",
  'preferences.ts#setLocale': "a person's own language toggle",
  'idempotency.ts#runIdempotent': 'infrastructure wrapper; the business write it runs audits itself',
  'job-phases.ts#ensureBprProcesses': 'idempotent seed of master processes; the phase plan built on them is audited',
  'kiosk-device.ts#requestEnrolment': 'unauthenticated by design (D18); an audit row would carry nothing but a pairing code',
  'kiosk-device.ts#recordDeviceSync': 'a sync heartbeat per pull/punch — thousands a day, no business change',
  'order-allocation.ts#allocateFromReceipt': 'tx helper inside confirmGRN / commitReceipt, which audit the receipt',
  'grn-alerts.ts#notifyGrnConfirmed': 'writes notification (inbox) rows; the GRN confirm itself is audited',
  'grn-alerts.ts#clearGrnAlertsFor': "marks the caller's own inbox rows read",
};

describe('every database writer leaves an audit row', () => {
  it('or is on the reviewed list — and the list holds nothing stale', () => {
    const unaudited: string[] = [];
    const audited: string[] = [];
    for (const file of SERVER_FILES) {
      for (const fn of exportedBodies(file)) {
        if (!WRITES.test(fn.body)) continue;
        const key = `${file.replace('src/server/mis/', '')}#${fn.name}`;
        if (/\blogAuditEvent\(/.test(fn.body)) audited.push(key);
        else unaudited.push(key);
      }
    }
    expect(audited.length).toBeGreaterThan(60); // the scan found the writers (a broken regex would pass vacuously)
    const missing = unaudited.filter((k) => !(k in REVIEWED_UNAUDITED));
    expect(missing, `add logAuditEvent, or a reviewed reason: ${missing.join(', ')}`).toEqual([]);
    const stale = Object.keys(REVIEWED_UNAUDITED).filter((k) => !unaudited.includes(k));
    expect(stale, `now audited or gone — remove from the list: ${stale.join(', ')}`).toEqual([]);
  });

  it('a manual stock adjustment is audited with the balance before and after (the one gap V2 closed)', () => {
    const calls = auditCallsIn('src/server/mis/inventory.ts');
    expect(calls.map((c) => c.action)).toContain('inventory.adjust');
    const adjust = calls.find((c) => c.action === 'inventory.adjust')!;
    expect(adjust.payloadKeys).toEqual(expect.arrayContaining(['balanceQty', 'changeQty']));
  });
});

describe('audit rows are immutable', () => {
  it('nothing in the app updates, upserts or deletes misAuditLog; only logAuditEvent creates', () => {
    const files = listFiles('src', /\.tsx?$/).filter((f) => !f.includes('/generated/') && !/\.test\.tsx?$/.test(f));
    const touching = files.filter((f) => /misAuditLog\.(update|upsert|delete|updateMany|deleteMany|updateManyAndReturn)\(/.test(readSource(f)));
    expect(touching).toEqual([]);
    const creators = files.filter((f) => /misAuditLog\.create\(/.test(readSource(f)));
    expect(creators).toEqual(['src/server/mis/audit.ts']);
  });
});

describe('an update audit is a diff', () => {
  it('every *.update action that writes `before` also writes `after`', () => {
    const oneSided = SERVER_FILES.flatMap((f) => auditCallsIn(f))
      .filter((c) => c.action?.endsWith('.update'))
      .filter((c) => {
        const src = readSource(c.file);
        const at = src.indexOf(`'${c.action}'`);
        const call = src.slice(at, src.indexOf('});', at));
        return /\bbefore\b/.test(call) !== /\bafter\b/.test(call);
      })
      .map((c) => `${c.file} · ${c.action}`);
    expect(oneSided).toEqual([]);
  });
});
