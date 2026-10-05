/**
 * F-23(8) — the phone document list turned ANY pasted string straight into an `href`
 * (`<a href={r.filePath}>`), unlike the desktop library which already refuses an unsafe link
 * (D31, `safeHref`). A stored `javascript:`/`data:` link would otherwise run when the next
 * person on a phone taps "Download". This pins the fix: the phone list now runs the same check.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/app/(mis)/mis/documents/actions', () => ({
  addDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));

import { DocumentsScreen } from './documents-screen';

const order = { id: 'o1', orderNumber: 'ORD-118', description: 'Duplex carton' };

const doc = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'd1', name: 'Spec.pdf', description: null, filePath: 'https://files.example.com/a.pdf',
  fileSize: 1024, mimeType: 'application/pdf', createdAt: '2026-09-05T00:00:00.000Z', uploadedByProfile: null,
  ...over,
});

function mockFetchOnce(docs: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => docs }) as unknown as typeof fetch;
}

async function selectOrder() {
  render(<DocumentsScreen orders={[order]} canWrite={false} />);
  fireEvent.change(screen.getByLabelText('Filter by Order'), { target: { value: 'o1' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/mis/docs/o1'));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// DataTable (the kit component) renders both the desktop table and the phone card layout at
// once, switching which is visible with CSS (D3) — so every row's content appears twice in the
// DOM. Assert over every match, not just the first.

describe('a safe link (http/https) renders as a real Download link', () => {
  it('an https:// filePath becomes a clickable href', async () => {
    mockFetchOnce([doc({ filePath: 'https://files.example.com/a.pdf' })]);
    await selectOrder();
    const links = await screen.findAllByRole('link', { name: 'Download' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('https://files.example.com/a.pdf');
  });

  it('a same-site path (/…) also becomes a real href', async () => {
    mockFetchOnce([doc({ filePath: '/files/a.pdf' })]);
    await selectOrder();
    const links = await screen.findAllByRole('link', { name: 'Download' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('/files/a.pdf');
  });
});

describe('an unsafe link never becomes an href (F-23(8), D31)', () => {
  it('a javascript: link renders as inert text, not a clickable anchor', async () => {
    mockFetchOnce([doc({ filePath: 'javascript:alert(1)' })]);
    await selectOrder();
    const notices = await screen.findAllByText('Link not safe to open');
    expect(notices.length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Download' })).toHaveLength(0);
  });

  it('a data: link is also refused', async () => {
    mockFetchOnce([doc({ filePath: 'data:text/html,<script>alert(1)</script>' })]);
    await selectOrder();
    expect((await screen.findAllByText('Link not safe to open')).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Download' })).toHaveLength(0);
  });

  it('a protocol-relative //evil.example link is refused', async () => {
    mockFetchOnce([doc({ filePath: '//evil.example/a.pdf' })]);
    await selectOrder();
    expect((await screen.findAllByText('Link not safe to open')).length).toBeGreaterThan(0);
  });
});
