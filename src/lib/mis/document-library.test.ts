import { describe, expect, it } from 'vitest';

import {
  DOC_GROUPS, MAX_DESCRIPTION, MAX_LINK, MAX_NAME, MAX_QUERY, mimeFamily, normaliseQuery, parseGroup, parsePage, safeHref, sizeLabel, totalsFrom, validateDocumentInput,
} from './document-library';

describe('mimeFamily — from the recorded type only', () => {
  it('pdf, image and other; nothing recorded is untyped, never guessed from a name', () => {
    expect(mimeFamily('application/pdf')).toBe('pdf');
    expect(mimeFamily(' Application/PDF ')).toBe('pdf');
    expect(mimeFamily('image/jpeg')).toBe('image');
    expect(mimeFamily('IMAGE/PNG')).toBe('image');
    expect(mimeFamily('text/plain')).toBe('other');
    for (const m of [null, undefined, '', '   ']) expect(mimeFamily(m)).toBe('untyped');
    // Only the exact type is a PDF, and only the image/ family is an image — a look-alike in the middle is neither.
    for (const m of ['application/x-pdf', 'text/pdf-notes', 'application/x-image-data', 'text/image']) expect(mimeFamily(m)).toBe('other');
  });
});

describe('the URL parameters', () => {
  it('a group is one of the known ones; anything else is all', () => {
    for (const g of DOC_GROUPS) expect(parseGroup(g)).toBe(g);
    for (const g of ['', 'ALL', 'generated', 5, null, undefined, ['pdf'], 'pdf ']) expect(parseGroup(g)).toBe('all');
  });

  it('a page is a whole number of 1 or more', () => {
    expect(parsePage('3')).toBe(3);
    for (const p of ['0', '-1', '1.5', 'x', '', undefined, ['2'], '1234567', 4]) expect(parsePage(p)).toBe(1);
  });

  it('a search is trimmed and capped; non-text is empty', () => {
    expect(normaliseQuery('  ORD-118  ')).toBe('ORD-118');
    expect(normaliseQuery('x'.repeat(MAX_QUERY + 40))).toHaveLength(MAX_QUERY);
    for (const q of [5, null, undefined, ['a'], {}]) expect(normaliseQuery(q)).toBe('');
  });
});

describe('safeHref — a pasted link is followed only when it is safe', () => {
  it('follows an absolute http(s) URL and a site path', () => {
    for (const u of ['https://files.example.com/a/COA.pdf', 'http://intranet/docs/x', '/files/abc.pdf', '  https://x.example/a  ']) expect(safeHref(u)).toBe(u.trim());
  });

  it('refuses script, data, file and other schemes, protocol-relative and backslash paths, blank and over-long', () => {
    for (const u of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'ftp://x/y', '//evil.example/x', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/a b', 'https://x.example/a b', 'C:\\docs\\a.pdf', 'docs/a.pdf', '', '   ', null, undefined, `https://x.example/${'a'.repeat(MAX_LINK)}`]) {
      expect(safeHref(u as string)).toBeNull();
    }
  });
});

describe('sizeLabel — a missing size is not zero', () => {
  it('null, undefined, negative and non-finite are "not recorded" (null)', () => {
    for (const b of [null, undefined, -1, Number.NaN, Infinity]) expect(sizeLabel(b)).toBeNull();
  });

  it('zero is a real size', () => {
    expect(sizeLabel(0)).toBe('0 B');
  });

  it('bytes, KB, MB and GB at the boundaries', () => {
    expect(sizeLabel(1023)).toBe('1023 B');
    expect(sizeLabel(1024)).toBe('1 KB');
    expect(sizeLabel(318 * 1024)).toBe('318 KB');
    expect(sizeLabel(1024 * 1024 - 1)).toBe('1024 KB');
    expect(sizeLabel(1024 * 1024)).toBe('1.0 MB');
    expect(sizeLabel(1.9 * 1024 * 1024)).toBe('1.9 MB');
    expect(sizeLabel(1024 ** 3)).toBe('1.0 GB');
  });
});

describe('totalsFrom — one grouped count', () => {
  it('sums files, recorded bytes and the files with no size, by family', () => {
    const t = totalsFrom([
      { mimeType: 'application/pdf', count: 10, bytes: 1000, sized: 8 },
      { mimeType: 'image/jpeg', count: 4, bytes: 400, sized: 4 },
      { mimeType: 'image/png', count: 1, bytes: 0, sized: 0 },
      { mimeType: 'text/plain', count: 2, bytes: 20, sized: 2 },
      { mimeType: null, count: 3, bytes: 0, sized: 0 },
    ]);
    expect(t).toEqual({ files: 20, recordedBytes: 1420, unsized: 6, byGroup: { pdf: 10, image: 5, other: 2, untyped: 3 } });
  });

  it('nothing recorded is zero files and no invented size', () => {
    expect(totalsFrom([])).toEqual({ files: 0, recordedBytes: 0, unsized: 0, byGroup: { pdf: 0, image: 0, other: 0, untyped: 0 } });
  });
});

describe('validateDocumentInput — an add', () => {
  const ok = { orderId: 'o1', name: 'COA March', description: '', link: 'https://files.example.com/coa.pdf' };

  it('accepts a good one', () => {
    expect(validateDocumentInput(ok)).toBeNull();
    expect(validateDocumentInput({ ...ok, link: '/files/coa.pdf', description: undefined })).toBeNull();
  });

  it('checks in a fixed order: order, name, description, link', () => {
    expect(validateDocumentInput({ ...ok, orderId: ' ', name: '' })).toMatch(/order/);
    expect(validateDocumentInput({ ...ok, name: '  ' })).toMatch(/needs a name/);
    expect(validateDocumentInput({ ...ok, name: 'x'.repeat(MAX_NAME + 1) })).toMatch(/at most/);
    expect(validateDocumentInput({ ...ok, description: 'x'.repeat(MAX_DESCRIPTION + 1) })).toMatch(/description is at most/);
    expect(validateDocumentInput({ ...ok, link: ' ' })).toMatch(/needs a link/);
  });

  it('refuses a link that is not safe to follow — even though it is a "path"', () => {
    for (const link of ['javascript:alert(1)', 'data:text/html,x', 'C:\\a.pdf', 'a.pdf']) expect(validateDocumentInput({ ...ok, link })).toMatch(/http\(s\)/);
  });

  it('a name at the limit is accepted', () => {
    expect(validateDocumentInput({ ...ok, name: 'x'.repeat(MAX_NAME) })).toBeNull();
    expect(validateDocumentInput({ ...ok, description: 'x'.repeat(MAX_DESCRIPTION) })).toBeNull();
  });
});
