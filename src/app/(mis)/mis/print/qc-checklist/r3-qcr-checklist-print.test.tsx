/**
 * R3-QCR B80: the QC checklist print route clamps a future date and never falls back to a different template.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/orders', () => ({ getOrder: async () => ({ id: ORDER_ID, orderNumber: 'ORD-118', customer: { name: 'Acme' } }) }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: async () => [] }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));
const listQcTemplates = vi.fn();
vi.mock('@/server/mis/qc-template', () => ({ listQcTemplates: (...a: unknown[]) => listQcTemplates(...a) }));

const ORDER_ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';
const { default: Page } = await import('./[id]/page');
const run = (sp: { template?: string; date?: string }) => Page({ params: Promise.resolve({ id: ORDER_ID }), searchParams: Promise.resolve(sp) });

const tpl = (id: string, name: string, isActive = true) => ({ id, name, processName: null, slotStart: '09:15', slotEnd: '10:15', parameters: ['Shade'], slots: ['09:15', '10:15'], isActive, sortOrder: 0 });

/** JSX splits "Date: {x}" into separate children; collapse the joins so assertions read like the page. */
const textContent = (node: ReactNode) => rawText(node).replace(/\s+/g, ' ');
function rawText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(rawText).join(' ');
  if (isValidElement(node)) return rawText((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  listQcTemplates.mockResolvedValue([tpl('t1', 'Printing form'), tpl('t2', 'Old form', false)]);
});

describe('B80 template', () => {
  it('an unknown template id shows the banner and prints no checklist', async () => {
    const text = textContent(await run({ template: 'nope' }));
    expect(text).toContain('Template not found — choose one');
    expect(text).not.toContain('QC CHECKLIST');
    expect(text).not.toContain('PRINTING FORM'); // no silent templates[0]
  });

  it('an inactive template shows the banner too', async () => {
    const text = textContent(await run({ template: 't2' }));
    expect(text).toContain('Template not found — choose one');
    expect(text).not.toContain('QC CHECKLIST');
  });

  it('no template id at all defaults to the first active form', async () => {
    expect(textContent(await run({}))).toContain('QC CHECKLIST · PRINTING FORM');
  });

  it('a valid template prints', async () => {
    expect(textContent(await run({ template: 't1' }))).toContain('QC CHECKLIST · PRINTING FORM');
  });
});

describe('B80 date', () => {
  it('a future date is clamped to today with a note', async () => {
    const text = textContent(await run({ template: 't1', date: '2099-01-01' }));
    expect(text).toContain('That date is in the future');
    expect(text).not.toContain('01/01/2099');
  });

  it('a past date is kept and carries no note', async () => {
    const text = textContent(await run({ template: 't1', date: '2020-02-03' }));
    expect(text).toContain('Date: 03/02/2020');
    expect(text).not.toContain('That date is in the future');
  });
});
