/**
 * Phase 24F · F-26 — every search box meets the MIS input rules.
 *
 * Found in the browser: twenty list screens drew their search box at 14px, about 38px tall, with no background and a
 * faint border, so on the cream page the placeholder was almost invisible (the design's MasterTable sheet draws a 48px box
 * with a visible placeholder), and iOS zooms the page on a field under 16px. The rules are `MIS invariants`: 48px inputs,
 * 16px text. This reads every screen's source so a new search box cannot ship at the old size.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { listFiles } from '@/server/mis/testing/ast';

// The desktop shell's top-bar search is the D3 artboard's 44px field — a desktop-only control with a keyboard, drawn that way.
const FILES = listFiles('src/components/mis', /\.tsx$/).filter((f) => !/\.test\.tsx$/.test(f) && !f.endsWith('desktop/desktop-shell.tsx'));
const searchInputs = FILES.flatMap((file) => {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/<input\b[\s\S]*?\/>/g)].filter((m) => m[0].includes('type="search"')).map((m) => ({ file, tag: m[0] }));
});

describe('search inputs', () => {
  it('found them (a broken scan would pass vacuously)', () => {
    expect(searchInputs.length).toBeGreaterThanOrEqual(25);
  });

  it.each(searchInputs.map((s, i) => [`${s.file} #${i}`, s.tag]))('%s is 48px tall, 16px text, on a white ground with a readable border', (_name, tag) => {
    expect(tag).toMatch(/min-h-12/);
    expect(tag).toMatch(/text-base/);
    expect(tag).not.toMatch(/\btext-sm\b/);
    expect(tag).not.toMatch(/\bpy-2\b/);
    expect(tag).toMatch(/bg-white/);
    expect(tag).toMatch(/border-slate-300/);
  });
});

describe('the other filter controls on those screens', () => {
  it('no screen still draws a text field or dropdown at the old 14px / 38px size on a see-through ground', () => {
    const old = FILES.filter((f) => /border-slate-200 px-3 py-2 text-sm/.test(readFileSync(f, 'utf8')));
    expect(old).toEqual([]);
  });
});

describe('the desktop screens name a text colour on every field', () => {
  // Found in the browser: the D10–D13 search boxes and the "As of" date drew their text and placeholder in a faint grey
  // on the cream page because they set a size and a border but no text colour.
  const controls = FILES.filter((f) => f.includes('components/mis/desktop/')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/<(input|select|textarea)\b[\s\S]*?(?:\/>|>)/g)]
      .map((m) => m[0])
      .filter((tag) => !/type="hidden"/.test(tag) && !/type="checkbox"|type="radio"/.test(tag) && /className/.test(tag))
      .map((tag) => ({ file, tag })),
  );

  it('found them', () => {
    expect(controls.length).toBeGreaterThanOrEqual(12);
  });

  it.each(controls.map((c, i) => [`${c.file} #${i}`, c.tag]))('%s', (_name, tag) => {
    // A className held in a shared constant (`field`, `input`) is checked where the constant is declared.
    if (/className=\{/.test(tag)) return;
    expect(tag).toMatch(/text-slate-\d00/);
  });

  it('the shared field constants name one too', () => {
    for (const f of ['documents-add-form.tsx', 'rules-change-form.tsx', 'master-edit-form.tsx']) {
      expect(readFileSync(`src/components/mis/desktop/${f}`, 'utf8')).toMatch(/const (field|input) = '[^']*text-slate-900/);
    }
  });
});
