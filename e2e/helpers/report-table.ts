import type { Locator } from '@playwright/test';

/** An amount as a report or ledger cell prints it, such as `1.200.000 ₫` or `-450.000 ₫`. */
export function amountOf(text: string): number {
  const match = /([-−]?)([\d.,]+)\s₫$/.exec(text.trim());
  if (match === null) throw new Error(`No amount in "${text}"`);
  return (match[1] === '' ? 1 : -1) * Number(match[2]?.replace(/[.,]/g, ''));
}

type ScreenRow = { key: string; cells: Record<string, string> };

/** A `ReportTable` as the screen shows it: header labels, column ids, and each row's cell text by column, phone labels left out. */
export async function readReportTable(scope: Locator) {
  const columns = await scope.locator('thead th').evaluateAll((cells) => cells.map((cell) => cell.textContent?.trim() ?? ''));
  const ids = await scope.getByTestId('report-total').locator('[data-column]').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-column') ?? ''));
  const read = async (row: Locator): Promise<ScreenRow> => ({
    key: (await row.getAttribute('data-key')) ?? '',
    cells: Object.fromEntries(
      await row.locator('th, [data-column]').evaluateAll((cells) =>
        cells.map((cell, index) => [cell.getAttribute('data-column') ?? `#${index}`, [...cell.childNodes].filter((node) => !(node instanceof HTMLElement && node.getAttribute('aria-hidden') === 'true')).map((node) => node.textContent ?? '').join('').trim()]),
      ),
    ),
  });
  const rows = await Promise.all((await scope.getByTestId('report-row').all()).map(read));
  const totals = await read(scope.getByTestId('report-total'));
  const amounts = (row: ScreenRow) => Object.fromEntries(ids.filter((id) => /₫$/.test(row.cells[id] ?? '')).map((id) => [id, amountOf(row.cells[id] ?? '')]));
  return { columns, ids, rows: rows.map((row) => ({ ...row, amounts: amounts(row) })), totals: { ...totals, amounts: amounts(totals) } };
}
