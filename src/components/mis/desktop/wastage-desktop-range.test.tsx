import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type { KeyRange } from '@/lib/mis/report-range';
import { DesktopRangeTabs } from './wastage-desktop';

vi.mock('../kit/range-tabs', () => ({ RangeTabs: () => <span>range picker</span> }));

afterEach(cleanup);
const resize = (width: number) => act(() => { window.innerWidth = width; window.dispatchEvent(new Event('resize')); });

describe('the desktop wastage range picker', () => {
  it('mounts only at the lg width, so a phone holds one picker in the DOM, and follows a resize', () => {
    resize(375);
    render(<DesktopRangeTabs basePath="/mis/reports" range={{} as KeyRange} />);
    expect(screen.queryByText('range picker')).toBeNull();
    resize(1024);
    expect(screen.queryByText('range picker')).not.toBeNull();
    resize(1023);
    expect(screen.queryByText('range picker')).toBeNull();
  });
});
