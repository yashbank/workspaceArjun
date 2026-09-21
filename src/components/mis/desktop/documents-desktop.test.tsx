/**
 * Phase 24E · D13 — documents.
 *
 * What a screenshot cannot enforce: that no field with no source is drawn as a fact (no generated/uploaded split, no
 * version, no retention rule, no preview, no upload, no "Unlinked 0"), that a missing size or type reads "not recorded"
 * and never 0, that an unsafe link is text and never an `href`, that the Add control is ABSENT (not disabled) for a role
 * that may not add, and that a failed add keeps what was typed.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_LIBRARY, type DocDetailView, type DocLibraryView, type DocRowView } from '@/lib/mis/document-library';

const addDocumentLinkAction = vi.hoisted(() => vi.fn(async (_s: unknown, _f: FormData) => ({ error: null as string | null, values: undefined as undefined | { orderId: string; name: string; description: string; link: string } })));
vi.mock('@/app/(mis)/mis/documents/desktop-actions', () => ({ addDocumentLinkAction }));

import { DocumentsDesktop } from './documents-desktop';

const row = (n: number, over: Partial<DocRowView> = {}): DocRowView => ({ id: `d${n}`, name: `Doc ${n}`, orderId: 'o1', orderNumber: 'ORD-2026-118', orderDescription: 'Duplex carton', family: 'pdf', addedLabel: '05/09/2026', addedIso: '2026-09-05T04:30:00.000Z', size: '318 KB', description: null, ...over });
const detail = (over: Partial<DocDetailView> = {}): DocDetailView => ({ ...row(1), link: 'https://files.example.com/a.pdf', href: 'https://files.example.com/a.pdf', mimeType: 'application/pdf', addedFull: '05/09/2026 10:00', addedBy: 'A. Bhaskar', ...over });
const view = (over: Partial<DocLibraryView> = {}): DocLibraryView => ({
  ...EMPTY_LIBRARY(),
  totals: { files: 5, recordedBytes: 2 * 1024 * 1024, unsized: 1, byGroup: { pdf: 2, image: 1, other: 1, untyped: 1 } },
  monthCount: 3, matching: 2, rows: [row(1), row(2, { name: 'Shade sample', family: 'image', size: null })], selected: detail(), canWrite: true,
  ...over,
});

describe('the header', () => {
  it('counts the files, states the recorded size honestly, and says every file is attached to an order — with no "Unlinked" count', () => {
    render(<DocumentsDesktop view={view()} />);
    expect(screen.getByText('5 files · 2.0 MB of recorded size (1 without a size) · every one attached to an order')).toBeTruthy();
    expect(screen.queryByText(/unlinked/i)).toBeNull();
  });

  it('when no size is recorded at all it says so instead of "0 B"', () => {
    render(<DocumentsDesktop view={view({ totals: { files: 3, recordedBytes: 0, unsized: 3, byGroup: { pdf: 3, image: 0, other: 0, untyped: 0 } } })} />);
    expect(screen.getByText(/3 files · no sizes recorded/)).toBeTruthy();
    expect(screen.queryByText(/0 B/)).toBeNull();
  });

  it('"1 file" is singular; an empty library has no size clause', () => {
    const { rerender } = render(<DocumentsDesktop view={view({ totals: { files: 1, recordedBytes: 10, unsized: 0, byGroup: { pdf: 1, image: 0, other: 0, untyped: 0 } } })} />);
    expect(screen.getByText(/^1 file · /)).toBeTruthy();
    rerender(<DocumentsDesktop view={view({ totals: { files: 0, recordedBytes: 0, unsized: 0, byGroup: { pdf: 0, image: 0, other: 0, untyped: 0 } }, rows: [], selected: null })} />);
    expect(screen.getByText('0 files · every one attached to an order')).toBeTruthy();
  });
});

describe('the search', () => {
  it('is a plain GET form that keeps the group and the query, capped at 60', () => {
    const { container } = render(<DocumentsDesktop view={view({ query: 'ORD-118', group: 'pdf' })} />);
    const form = container.querySelector('form[role="search"]')!;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/mis/documents');
    expect((form.querySelector('input[name="group"]') as HTMLInputElement).value).toBe('pdf');
    const input = screen.getByLabelText('Search') as HTMLInputElement;
    expect(input.defaultValue).toBe('ORD-118');
    expect(input.getAttribute('maxlength')).toBe('60');
  });

  it('keeps no group field when the group is "all"', () => {
    const { container } = render(<DocumentsDesktop view={view()} />);
    expect(container.querySelector('input[name="group"]')).toBeNull();
  });
});

describe('the groups — by recorded file type, not by an invented category', () => {
  it('lists All, PDF, Images, Other and Type-not-recorded with their counts, and marks the current one', () => {
    render(<DocumentsDesktop view={view({ group: 'image' })} />);
    const nav = screen.getByRole('navigation', { name: 'File types' });
    expect(within(nav).getByRole('link', { name: /All documents/ }).textContent).toContain('5');
    expect(within(nav).getByRole('link', { name: /^Images/ }).getAttribute('aria-current')).toBe('true');
    expect(within(nav).getByRole('link', { name: /^PDF/ }).getAttribute('aria-current')).toBeNull();
    expect(within(nav).getByRole('link', { name: /Type not recorded/ }).textContent).toContain('1');
    expect(within(nav).getByRole('link', { name: /This month/ }).textContent).toContain('3');
  });

  it('draws no Generated / Uploaded split, no Job cards, Certificates, QC reports or BPR sheets — nothing records them', () => {
    const { container } = render(<DocumentsDesktop view={view()} />);
    for (const word of [/Job cards/, /Certificates/, /BPR/, /Customer POs/, /Approved samples/, /irreplaceable/i]) expect(container.textContent).not.toMatch(word);
  });

  it('a group link resets to page 1 and keeps the search; the current page is kept for the doc link', () => {
    render(<DocumentsDesktop view={view({ query: 'shade', page: 2, pageCount: 3, matching: 120 })} />);
    expect(screen.getByRole('link', { name: /^PDF/ }).getAttribute('href')).toBe('/mis/documents?q=shade&group=pdf');
    expect(screen.getByRole('link', { name: /Doc 1/ }).getAttribute('href')).toBe('/mis/documents?q=shade&page=2&doc=d1');
  });
});

describe('the list', () => {
  it('shows name, order, date and size — a missing size is left out, never 0', () => {
    render(<DocumentsDesktop view={view()} />);
    const list = screen.getByRole('region', { name: 'Documents, newest first' });
    expect(within(list).getByRole('link', { name: /Doc 1/ }).textContent).toContain('ORD-2026-118 · 05/09/2026 · 318 KB');
    const second = within(list).getByRole('link', { name: /Shade sample/ }).textContent!;
    expect(second).toContain('ORD-2026-118 · 05/09/2026');
    expect(second).not.toMatch(/\bKB\b|\bB\b|0 /);
  });

  it('each card carries its file type; the open one is marked', () => {
    render(<DocumentsDesktop view={view()} />);
    expect(within(screen.getByRole('link', { name: /Doc 1/ })).getByText('PDF')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: /Shade sample/ })).getByText('Image')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Doc 1/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: /Shade sample/ }).getAttribute('aria-current')).toBeNull();
  });

  it('reports the range, the total and the order, and pages with Older / Newer', () => {
    render(<DocumentsDesktop view={view({ page: 2, pageCount: 3, matching: 120 })} />);
    expect(screen.getByText('51–100 of 120 · newest first')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Newer' }).getAttribute('href')).toBe('/mis/documents');
    expect(screen.getByRole('link', { name: 'Older' }).getAttribute('href')).toBe('/mis/documents?page=3');
  });

  it('has no Newer on the first page and no Older on the last', () => {
    const { rerender } = render(<DocumentsDesktop view={view({ page: 1, pageCount: 2, matching: 60 })} />);
    expect(screen.queryByRole('link', { name: 'Newer' })).toBeNull();
    rerender(<DocumentsDesktop view={view({ page: 2, pageCount: 2, matching: 60 })} />);
    expect(screen.queryByRole('link', { name: 'Older' })).toBeNull();
  });

  it('an empty result reads 0–0 of 0, never 1–0', () => {
    render(<DocumentsDesktop view={view({ rows: [], selected: null, matching: 0, query: 'zzz' })} />);
    expect(screen.getByText('0–0 of 0 · newest first')).toBeTruthy();
  });

  it('an empty library and an empty search are different sentences', () => {
    const empty = { rows: [], selected: null, matching: 0 };
    const { rerender } = render(<DocumentsDesktop view={view({ ...empty, totals: { files: 0, recordedBytes: 0, unsized: 0, byGroup: { pdf: 0, image: 0, other: 0, untyped: 0 } } })} />);
    expect(screen.getByText('No documents are recorded yet')).toBeTruthy();
    rerender(<DocumentsDesktop view={view({ ...empty, query: 'zzz' })} />);
    expect(screen.getByText('Nothing matches')).toBeTruthy();
    expect(screen.queryByText('No documents are recorded yet')).toBeNull();
  });
});

describe('the open document', () => {
  it('shows where it is attached, who added it and when, its type and size', () => {
    render(<DocumentsDesktop view={view()} />);
    const d = screen.getByRole('region', { name: 'Doc 1' });
    expect(within(d).getByRole('link', { name: 'ORD-2026-118' }).getAttribute('href')).toBe('/mis/orders/o1');
    expect(d.textContent).toContain('05/09/2026 10:00 · A. Bhaskar');
    expect(d.textContent).toContain('application/pdf');
    expect(d.textContent).toContain('318 KB');
  });

  it('a missing size, type, person, retention and version read "not recorded" — never 0 or a guess', () => {
    render(<DocumentsDesktop view={view({ selected: detail({ size: null, mimeType: null, addedBy: null }) })} />);
    const d = screen.getByRole('region', { name: 'Doc 1' });
    expect(within(d).getByText('person not recorded').hasAttribute('hidden')).toBe(false);
    expect(within(d).getAllByText('not recorded')).toHaveLength(4); // type, size, retention, superseded-by
    expect(d.textContent).not.toMatch(/\b0 (B|KB)\b/);
  });

  it('offers no preview, no download and no version — and says why', () => {
    render(<DocumentsDesktop view={view()} />);
    expect(screen.getByText(/No preview: the MIS holds a link to the file, not the file/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
    expect(screen.queryByText(/\bV\d\b/)).toBeNull();
    expect(screen.getByText(/version, retention and replacement are not recorded/)).toBeTruthy();
  });

  it('Open follows a safe link in a new tab without opener or referrer', () => {
    render(<DocumentsDesktop view={view()} />);
    const open = screen.getByRole('link', { name: 'Open' });
    expect(open.getAttribute('href')).toBe('https://files.example.com/a.pdf');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('an unsafe link has NO Open control and no href anywhere: it is shown as text, with the reason', () => {
    const { container } = render(<DocumentsDesktop view={view({ selected: detail({ link: 'javascript:alert(1)', href: null }) })} />);
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    expect(screen.getByText(/not a full http\(s\) address/)).toBeTruthy();
  });

  it('shows the description only when there is one', () => {
    const { rerender } = render(<DocumentsDesktop view={view({ selected: detail({ description: 'Signed copy' }) })} />);
    expect(screen.getByText('Signed copy')).toBeTruthy();
    rerender(<DocumentsDesktop view={view()} />);
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('with nothing open it says to pick one', () => {
    render(<DocumentsDesktop view={view({ selected: null })} />);
    expect(screen.getByText('Pick a document to see where it is attached.')).toBeTruthy();
  });
});

describe('who sees Add', () => {
  it('the control is a link for a role that may add, and ABSENT — not disabled — for one that may not', () => {
    const { rerender } = render(<DocumentsDesktop view={view()} />);
    expect(screen.getByRole('link', { name: 'Add document' }).getAttribute('href')).toBe('/mis/documents?add=1');
    rerender(<DocumentsDesktop view={view({ canWrite: false })} />);
    expect(screen.queryByRole('link', { name: 'Add document' })).toBeNull();
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
  });

  it('says a file was added only when the redirect said so', () => {
    const { rerender } = render(<DocumentsDesktop view={view()} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<DocumentsDesktop view={view({ notice: 'added' })} />);
    expect(screen.getByRole('status').textContent).toMatch(/added/);
  });
});

describe('the add form', () => {
  const open = (over: Partial<DocLibraryView> = {}) => view({ add: { orders: [{ id: 'o1', label: 'ORD-2026-118 — Duplex carton' }] }, ...over });

  it('replaces the open document, lists the visible orders, and marks the required fields', () => {
    render(<DocumentsDesktop view={open()} />);
    expect(screen.queryByRole('region', { name: 'Doc 1' })).toBeNull();
    const form = screen.getByRole('region', { name: 'Add document' });
    expect(within(form).getByRole('option', { name: 'ORD-2026-118 — Duplex carton' })).toBeTruthy();
    for (const label of [/^Order/, /^Name/, /^Link to the file/]) expect((within(form).getByLabelText(label) as HTMLInputElement).required).toBe(true);
    expect((within(form).getByLabelText('Description') as HTMLInputElement).required).toBe(false);
  });

  it('has no file picker: the MIS holds a link, not the file, and the form says so', () => {
    const { container } = render(<DocumentsDesktop view={open()} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(/The MIS keeps this link, not the file/)).toBeTruthy();
  });

  it('inputs are 48px tall with 16px text', () => {
    render(<DocumentsDesktop view={open()} />);
    for (const label of [/^Order/, /^Name/, /^Description/, /^Link to the file/]) {
      const cls = screen.getByLabelText(label).className;
      expect(cls).toContain('min-h-12');
      expect(cls).toContain('text-base');
    }
  });

  it('closing goes back to the list, keeping the group and search', () => {
    render(<DocumentsDesktop view={open({ group: 'pdf', query: 'x' })} />);
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe('/mis/documents?q=x&group=pdf');
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/mis/documents?q=x&group=pdf');
  });

  it('a refused add shows the message AND keeps everything typed — the link is not lost to a typo or a dropped connection', async () => {
    addDocumentLinkAction.mockResolvedValueOnce({ error: 'The link must be a full http(s) address or a path starting with /.', values: { orderId: 'o1', name: 'COA', description: 'March', link: 'javascript:1' } });
    const { container } = render(<DocumentsDesktop view={open()} />);
    await act(async () => { fireEvent.submit(container.querySelector('form:not([method="get"])')!); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/full http\(s\) address/));
    expect((screen.getByLabelText(/^Order/) as HTMLSelectElement).value).toBe('o1');
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('COA');
    expect((screen.getByLabelText(/^Description/) as HTMLInputElement).value).toBe('March');
    expect((screen.getByLabelText(/^Link to the file/) as HTMLInputElement).value).toBe('javascript:1');
  });

  it('while it is being added the button says so and is disabled, so it cannot be sent twice', async () => {
    let release: (v: { error: null; values: undefined }) => void = () => {};
    addDocumentLinkAction.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const { container } = render(<DocumentsDesktop view={open()} />);
    await act(async () => { fireEvent.submit(container.querySelector('form:not([method="get"])')!); });
    expect(((await screen.findByRole('button', { name: 'Adding…' })) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release({ error: null, values: undefined }));
  });
});

describe('states', () => {
  it('a refusal is "no access" and shows nothing; a failed load says so and links to the classic screen', () => {
    const { unmount } = render(<DocumentsDesktop view={null} denied />);
    expect(screen.getByRole('alert').textContent).toMatch(/do not have access/);
    unmount();
    render(<DocumentsDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the classic screen' }).getAttribute('href')).toBe('/mis/documents?view=classic');
  });
});

describe('hygiene', () => {
  const dir = path.resolve(__dirname);
  const files = ['documents-desktop.tsx', 'documents-add-form.tsx'].map((f) => readFileSync(path.join(dir, f), 'utf8'));

  it('introduces no hex colour beyond the one the D10 panel already uses', () => {
    for (const src of files) expect((src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).every((h) => h.toLowerCase() === '#f1ebdf')).toBe(true);
  });

  it('the client files import no server module by value', () => {
    for (const src of files) expect((src.match(/^import\s[^;]*?from\s'@\/server\/[^']+';/gm) ?? []).filter((l) => !l.startsWith('import type'))).toEqual([]);
  });

  it('there is no third layout: no sm/md/xl/2xl breakpoint, only lg', () => {
    for (const src of files) expect(src).not.toMatch(/\b(sm|md|xl|2xl):/);
  });

  it('no English is hard-coded in an aria-label', () => {
    for (const src of files) expect(src).not.toMatch(/aria-label="[A-Za-z]/);
  });

  it('a pasted link is never an href without going through the server-computed `href`', () => {
    const src = files[0];
    expect(src).not.toMatch(/href=\{doc\.link\}/);
    expect(src).not.toMatch(/href=\{[^}]*filePath/);
  });
});
