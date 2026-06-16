import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useConfirm } from './confirm-dialog';

// Harness: a button that calls confirm() and records the resolved boolean.
function Harness() {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({ title: 'Delete?', message: 'Are you sure?', destructive: true });
          document.body.setAttribute('data-result', String(ok));
        }}
      >
        trigger
      </button>
      {confirmDialog}
    </div>
  );
}

beforeEach(() => document.body.removeAttribute('data-result'));
afterEach(cleanup);

describe('useConfirm — non-blocking confirmation', () => {
  it('resolves true when the confirm button is clicked', async () => {
    render(<Harness />);
    // No dialog until triggered (does not block).
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => fireEvent.click(screen.getByText('trigger')));
    expect(screen.getByRole('dialog')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(document.body.getAttribute('data-result')).toBe('true');
    // Dialog closes after resolution.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves false when cancelled', async () => {
    render(<Harness />);
    await act(async () => fireEvent.click(screen.getByText('trigger')));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(document.body.getAttribute('data-result')).toBe('false');
  });

  it('resolves false on Escape', async () => {
    render(<Harness />);
    await act(async () => fireEvent.click(screen.getByText('trigger')));
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(document.body.getAttribute('data-result')).toBe('false');
  });
});
