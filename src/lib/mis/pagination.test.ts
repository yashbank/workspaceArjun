import { describe, expect, it } from 'vitest';

import { PAGE_SIZE, clampPage, pageCount, pageHref, pageLabel, pageQuery, pageWindow, parsePage, parseSearch, rangeLabel } from './pagination';

describe('pagination helper', () => {
  it('pages 10 at a time', () => {
    expect(PAGE_SIZE).toBe(10);
    expect(pageQuery('3')).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });
  it('treats junk page values as page 1', () => {
    for (const bad of [undefined, null, '', 'abc', '0', '-4', 'NaN']) expect(parsePage(bad)).toBe(1);
    expect(parsePage(['2', '5'])).toBe(2);
    expect(parsePage('2.9')).toBe(2);
  });
  it('counts pages, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(130)).toBe(13);
  });
  it('clamps a page past the end to the last page', () => {
    expect(clampPage(999, 130)).toBe(13);
    expect(clampPage(0, 130)).toBe(1);
  });
  it('trims and caps the search text', () => {
    expect(parseSearch('  PO-12 ')).toBe('PO-12');
    expect(parseSearch(undefined)).toBe('');
    expect(parseSearch('x'.repeat(300))).toHaveLength(100);
  });
  it('labels the range', () => {
    expect(rangeLabel(1, 0)).toBe('0 of 0');
    expect(rangeLabel(1, 130)).toBe('1-10 of 130');
    expect(rangeLabel(6, 130)).toBe('51-60 of 130');
  });
  it('labels the page', () => {
    expect(pageLabel(1, 0)).toBe('Page 1 of 1');
    expect(pageLabel(1, 130)).toBe('Page 1 of 13');
    expect(pageLabel(999, 130)).toBe('Page 13 of 13');
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
