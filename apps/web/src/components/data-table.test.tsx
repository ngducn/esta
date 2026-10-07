import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { DataTable, type DataColumn } from './data-table';

type Row = { id: string; unit: string };
const rows: Row[] = [
  { id: 'a', unit: 'Phòng 1' },
  { id: 'b', unit: 'Phòng 2' },
  { id: 'c', unit: 'Phòng 3' },
];
const columns: DataColumn<Row>[] = [{ id: 'unit', header: 'Phòng', cell: (row) => row.unit }];

function setup() {
  const onSelectionChange = vi.fn();
  renderInLocale(
    <DataTable caption="Phòng" columns={columns} rows={rows} rowId={(row) => row.id} rowLabel={(row) => row.unit} selectable onSelectionChange={onSelectionChange} />,
  );
  const count = () => screen.getByTestId('selection-count').textContent;
  const lastSelection = () => [...(onSelectionChange.mock.lastCall?.[0] ?? [])].sort();
  return { count, lastSelection };
}

describe('DataTable', () => {
  it('selects every row with select-all, and clears them again', () => {
    const { count, lastSelection } = setup();
    const selectAll = screen.getByRole('checkbox', { name: 'Chọn tất cả' });
    fireEvent.click(selectAll);
    expect(lastSelection()).toEqual(['a', 'b', 'c']);
    expect(count()).toBe('Đã chọn 3');
    for (const row of rows) expect(screen.getByRole('checkbox', { name: `Chọn ${row.unit}` }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(selectAll);
    expect(lastSelection()).toEqual([]);
    expect(count()).toBe('');
  });

  it('marks select-all as mixed when some rows are selected', () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Phòng 2' }));
    expect(screen.getByRole('checkbox', { name: 'Chọn tất cả' }).getAttribute('aria-checked')).toBe('mixed');
  });

  it('selects rows from the keyboard with Tab and Space', async () => {
    const user = userEvent.setup();
    const { count, lastSelection } = setup();
    screen.getByRole('checkbox', { name: 'Chọn tất cả' }).focus();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Chọn Phòng 1' }));
    await user.keyboard(' ');
    await user.tab();
    await user.keyboard(' ');
    expect(lastSelection()).toEqual(['a', 'b']);
    expect(count()).toBe('Đã chọn 2');
    expect(within(screen.getByRole('region', { name: 'Phòng' })).getAllByRole('row').filter((row) => row.hasAttribute('data-selected'))).toHaveLength(2);
  });
});
