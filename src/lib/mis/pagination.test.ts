import { describe, expect, it } from 'vitest';

import { PAGE_SIZE, clampPage, pageCount, pageHref, pageQuery, pageWindow, parsePage, parseSearch, rangeLabel } from './pagination';

describe('pagination helper', () => {
  it('pages 25 at a time', () => {
    expect(PAGE_SIZE).toBe(25);
    expect(pageQuery('3')).toEqual({ page: 3, pageSize: 25, skip: 50, take: 25 });
  });
  it('treats junk page values as page 1', () => {
    for (const bad of [undefined, null, '', 'abc', '0', '-4', 'NaN']) expect(parsePage(bad)).toBe(1);
    expect(parsePage(['2', '5'])).toBe(2);
    expect(parsePage('2.9')).toBe(2);
  });
  it('counts pages, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
    expect(pageCount(130)).toBe(6);
  });
  it('clamps a page past the end to the last page', () => {
    expect(clampPage(999, 130)).toBe(6);
    expect(clampPage(0, 130)).toBe(1);
  });
  it('trims and caps the search text', () => {
    expect(parseSearch('  PO-12 ')).toBe('PO-12');
    expect(parseSearch(undefined)).toBe('');
    expect(parseSearch('x'.repeat(300))).toHaveLength(100);
  });
  it('labels the range', () => {
    expect(rangeLabel(1, 0)).toBe('0 of 0');
    expect(rangeLabel(1, 130)).toBe('1-25 of 130');
    expect(rangeLabel(6, 130)).toBe('126-130 of 130');
  });
  it('windows page numbers with gaps', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, '…', 10]);
    expect(pageWindow(5, 10)).toEqual([1, '…', 3, 4, 5, 6, 7, '…', 10]);
    expect(pageWindow(10, 10)).toEqual([1, '…', 8, 9, 10]);
  });
  it('keeps search and filters in the page link, and drops page for page 1', () => {
    expect(pageHref('/mis/po', { q: 'abc', status: 'DRAFT', page: '4', empty: '' }, 2)).toBe('/mis/po?q=abc&status=DRAFT&page=2');
    expect(pageHref('/mis/po', { q: 'abc', page: '4' }, 1)).toBe('/mis/po?q=abc');
    expect(pageHref('/mis/po', {}, 1)).toBe('/mis/po');
  });
});
