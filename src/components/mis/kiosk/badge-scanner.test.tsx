// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BadgeScanner } from './badge-scanner';

afterEach(cleanup);

describe('BadgeScanner typed fallback (R2-105)', () => {
  it('sends the typed code on Enter and clears the box', () => {
    const onScan = vi.fn();
    render(<BadgeScanner onScan={onScan} />);
    const box = screen.getByLabelText('Badge code') as HTMLInputElement;
    fireEvent.change(box, { target: { value: ' emp001 ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onScan).toHaveBeenCalledWith('emp001');
    expect(box.value).toBe('');
  });

  it('ignores an empty entry', () => {
    const onScan = vi.fn();
    render(<BadgeScanner onScan={onScan} />);
    fireEvent.keyDown(screen.getByLabelText('Badge code'), { key: 'Enter' });
    expect(onScan).not.toHaveBeenCalled();
  });

  it('falls back to a message when the camera is unsupported', async () => {
    render(<BadgeScanner onScan={vi.fn()} />);
    fireEvent.click(screen.getByText('Scan with camera'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot scan with the camera|camera is blocked/i);
    expect(screen.getByLabelText('Badge code')).toBeTruthy();
  });

  it('shows scan feedback', () => {
    render(<BadgeScanner onScan={vi.fn()} feedback={{ tone: 'error', text: 'Badge X is not on the roll' }} />);
    expect(screen.getByRole('alert').textContent).toContain('not on the roll');
  });
});
