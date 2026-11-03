/**
 * A record keeps the tab the operator chose until a different record opens.
 *
 * The reset to the first tab used to run on mount as well; React may run that
 * effect after the first paint, so a tab clicked straight away was undone (seen
 * as a flaky "What this releases" test on Approvals in CI, 2026-11-03).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordPanel } from './RecordPanel';

afterEach(cleanup);

const tabs = [
  { key: 'overview', label: 'Overview', content: <p>overview body</p> },
  { key: 'more', label: 'More', content: <p>more body</p> },
];

describe('RecordPanel tabs', () => {
  it('keeps the chosen tab while the same record re-renders, and resets for a different one', () => {
    const { rerender } = render(<RecordPanel label="Thing" title="A thing" refId="X-1" tabs={tabs} />);
    expect(screen.getByText('overview body')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByText('more body')).toBeTruthy();

    rerender(<RecordPanel label="Thing" title="A thing" refId="X-1" tabs={[...tabs]} />);
    expect(screen.getByText('more body')).toBeTruthy();

    rerender(<RecordPanel label="Thing" title="Another thing" refId="X-2" tabs={[...tabs]} />);
    expect(screen.getByText('overview body')).toBeTruthy();
  });
});
