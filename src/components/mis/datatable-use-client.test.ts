import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const MIS_ROOT = join(__dirname);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('DataTable consumers are client components', () => {
  it('every non-test file under src/components/mis importing DataTable has \'use client\'', () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(MIS_ROOT)) {
      const content = readFileSync(file, 'utf8');
      if (/\bimport\s*{[^}]*\bDataTable\b[^}]*}\s*from\s*['"].*data-table['"]/.test(content)) {
        if (!/^['"]use client['"]/.test(content.trim())) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
