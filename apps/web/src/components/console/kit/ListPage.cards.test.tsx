import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListPage, plural, type ListColumn } from './ListPage';

type Row = { id: number; status: string; city: string; rider: string };
const columns: ListColumn<Row>[] = [
  { key: 'id', label: 'Trip', primary: true, render: (r) => `T-${r.id}` },
  { key: 'status', label: 'Status', render: (r) => <span className="ops-pill">{r.status}</span> },
  { key: 'city', label: 'City', card: 'hide', render: (r) => r.city },
  { key: 'rider', label: 'Rider', cardOrder: 4, render: (r) => r.rider },
];

function list(total: number) {
  return (
    <ListPage<Row> pageKey="t" title="Trips" views={[{ key: 'all', label: 'All', count: total }]} view="all" onView={() => {}}
      columns={columns} rows={[{ id: 7, status: 'Completed', city: 'Hyderabad', rider: 'Asha' }]} rowKey={(r) => r.id}
      total={total} page={1} pageSize={25} onPage={() => {}} />
  );
}

describe('console lists on phones (18 Nov close-out)', () => {
  it('marks each cell for the phone card: title, badge, hidden field, labelled field', () => {
    render(list(1));
    expect(screen.getByText('T-7').closest('td')?.dataset.card).toBe('title');
    expect(screen.getByText('Completed').closest('td')?.dataset.card).toBe('badge');
    expect(screen.getByText('Hyderabad').closest('td')?.dataset.card).toBe('hide');
    const rider = screen.getByText('Asha').closest('td') as HTMLElement;
    expect(rider.dataset.card).toBe('field');
    expect(rider.dataset.label).toBe('Rider');
    expect(rider.style.getPropertyValue('--card-order')).toBe('4');
  });

  it('counts read as English: 1 match, 12 matches', () => {
    const one = render(list(1)).container.querySelector('.ops-list__count')?.textContent;
    expect(one).toMatch(/^1 match ·/);
    const many = render(list(12)).container.querySelector('.ops-list__count')?.textContent;
    expect(many).toMatch(/^12 matches ·/);
    expect(plural(1, 'payout')).toBe('1 payout');
    expect(plural(2, 'payout')).toBe('2 payouts');
  });
});
