import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FixedMenu } from './fixed-menu';

afterEach(cleanup);

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={anchorRef} data-testid="anchor">
        trigger
      </button>
      <div data-testid="outside">outside</div>
      <FixedMenu open={open} onClose={onClose} anchorRef={anchorRef}>
        <button data-testid="item">Item</button>
      </FixedMenu>
    </div>
  );
}

describe('FixedMenu', () => {
  it('renders menu content when open', () => {
    render(<Harness open onClose={() => {}} />);
    expect(screen.getByTestId('item')).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('item')).toBeNull();
  });

  it('closes on an outside pointerdown', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a pointerdown inside the menu', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.pointerDown(screen.getByTestId('item'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on a pointerdown on the trigger/anchor (no immediate close)', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.pointerDown(screen.getByTestId('anchor'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
