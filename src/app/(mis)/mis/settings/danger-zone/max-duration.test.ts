import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('danger-zone route segment config (R2-385)', () => {
  it('exports maxDuration above the longest Prisma transaction timeout', () => {
    const page = read('src/app/(mis)/mis/settings/danger-zone/page.tsx');
    const m = /export const maxDuration = (\d+);/.exec(page);
    expect(m).not.toBeNull();
    const maxDuration = Number(m![1]);
    const timeouts = [...read('src/server/mis/data-reset.ts').matchAll(/timeout: (\d+(?:_\d+)*)/g)].map((x) => Number(x[1].replaceAll('_', '')));
    expect(timeouts.length).toBeGreaterThan(0);
    expect(Math.max(...timeouts) / 1000).toBeLessThan(maxDuration);
    expect(maxDuration).toBeLessThanOrEqual(800);
  });
});
