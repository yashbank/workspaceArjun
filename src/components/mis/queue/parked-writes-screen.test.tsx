import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const discard = vi.fn(async () => ({ ok: true }));
vi.mock('@/app/(mis)/mis/queue/actions', () => ({
  discardParkedWriteAction: (...a: unknown[]) => discard(...(a as [])),
  resolveParkedWriteAction: vi.fn(),
}));

const { ParkedWritesScreen } = await import('./parked-writes-screen');

const row = {
  key: 'k1', kind: 'production.log' as const, status: 'REJECTED' as const, payload: {},
  parkReason: 'MALFORMED', parkDetail: 'bad', clientRecordedAt: null, deviceId: null,
  actorId: null, attempts: 1, firstSeenAt: new Date('2026-11-01T00:00:00Z'), lastAttemptAt: null,
};

describe('R2-342 discard asks for confirmation', () => {
  beforeEach(() => discard.mockClear());

  function setup() {
    render(<ParkedWritesScreen rows={[row]} clearanceNow={{}} canClearanceOverride={false} canAttendanceOverride={false} />);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'corrupt entry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  }

  it('does not discard until confirmed', async () => {
    setup();
    expect(discard).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole('button', { name: 'Discard' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(discard).toHaveBeenCalledWith('k1', 'corrupt entry'));
  });

  it('cancel keeps the write', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(discard).not.toHaveBeenCalled();
  });
});
