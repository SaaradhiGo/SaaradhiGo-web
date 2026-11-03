/**
 * Typing in a drawer must keep the cursor in the text box.
 *
 * Owner report (2026-11-03): in "Mark SOS-5 as a false alarm" only one letter
 * could be typed before the cursor jumped elsewhere. The drawer's open effect
 * depended on `onClose`, which every caller passes inline, so each re-render
 * (each keystroke, and each 1 s tick on the Safety board) re-ran it and moved
 * focus to the close button.
 */
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Drawer } from './ui';

afterEach(cleanup);

function Harness({ tick }: { tick: number }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <span data-testid="tick">{tick}</span>
      {/* inline onClose on purpose: that is how every caller writes it */}
      <Drawer open={open} title="Mark as a false alarm" onClose={() => setOpen(false)}>
        <label htmlFor="why">Why</label>
        <textarea id="why" value={text} onChange={(e) => setText(e.target.value)} />
      </Drawer>
    </>
  );
}

describe('Drawer keeps focus where the operator put it', () => {
  it('a re-render while typing does not move focus out of the text box', () => {
    const { rerender } = render(<Harness tick={0} />);
    const box = screen.getByLabelText('Why') as HTMLTextAreaElement;
    box.focus();
    for (const [i, letter] of ['a', 'b', 'c'].entries()) {
      fireEvent.change(box, { target: { value: box.value + letter } });
      // a parent re-render, like the Safety board's 1 s timer
      act(() => { rerender(<Harness tick={i + 1} />); });
      expect(document.activeElement).toBe(box);
    }
    expect(box.value).toBe('abc');
  });

  it('Escape still closes with the latest onClose', () => {
    render(<Harness tick={0} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
