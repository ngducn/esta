import type { Metadata } from 'next';
import { AddressLookup } from './address-lookup';
import { LiveParse } from './live-parse';
import { checkRow, sections, type CheckedRow } from './sections';
import { AllocationSection } from './sections/AllocationSection';
import { TaxSection } from './sections/tax';
import { VietQrSection } from './sections/VietQrSection';

export const metadata: Metadata = {
  title: 'Core playground',
};

const NBSP = String.fromCharCode(160);

function showNbspOnMismatch(text: string, row: CheckedRow): string {
  return row.matches ? text : text.replaceAll(NBSP, '⍽');
}

type Column = {
  label: string;
  cell?: string;
  value: (row: CheckedRow) => string;
  className?: (row: CheckedRow) => string;
};

const COLUMNS: readonly Column[] = [
  { label: 'Function', value: (row) => row.fn },
  { label: 'Input', value: (row) => row.input },
  { label: 'Locale', value: (row) => row.locale ?? '' },
  { label: 'Expected', cell: 'expected', value: (row) => showNbspOnMismatch(row.expected, row) },
  { label: 'Actual', cell: 'actual', value: (row) => showNbspOnMismatch(row.actual, row) },
  {
    label: 'Result',
    cell: 'result',
    value: (row) => (row.matches ? 'OK' : 'MISMATCH'),
    className: (row) => (row.matches ? '' : 'font-semibold underline'),
  },
];

export default async function DevCorePage({ searchParams }: { searchParams: Promise<{ taxYear?: string }> }) {
  const { taxYear } = await searchParams;
  const checked = await Promise.all(
    sections.map(async (section) => ({ ...section, rows: await Promise.all(section.rows.map(checkRow)) })),
  );
  const rows = checked.flatMap((section) => section.rows);
  const mismatches = rows.filter((row) => !row.matches).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 font-semibold">Core playground</h1>
        <p data-testid="core-summary">
          {rows.length} checks, {mismatches} {mismatches === 1 ? 'mismatch' : 'mismatches'}
        </p>
      </header>

      <LiveParse />
      <AddressLookup />
      <VietQrSection />
      <AllocationSection />
      <TaxSection taxYear={taxYear} />

      {checked.map((section) => (
        <section key={section.id} aria-labelledby={`${section.id}-heading`} data-section={section.id}>
          <h2 id={`${section.id}-heading`} className="mb-2 text-lead font-semibold">
            {section.title}
          </h2>
          <table className="w-full text-left text-small max-sm:block">
            <thead className="max-sm:sr-only">
              <tr className="border-b">
                {COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className="py-1 pr-4">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums max-sm:block">
              {section.rows.map((row, index) => (
                <tr
                  key={index}
                  className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2"
                  data-fn={row.fn}
                  data-input={row.input}
                  data-locale={row.locale}
                >
                  {COLUMNS.map((column) => {
                    const value = column.value(row);
                    return (
                      <td
                        key={column.label}
                        className={`py-1 pr-4 wrap-anywhere ${value === '' ? 'max-sm:hidden' : 'max-sm:contents'} ${column.className?.(row) ?? ''}`}
                      >
                        <span aria-hidden="true" className="font-sans font-normal text-meta sm:hidden">
                          {column.label}
                        </span>
                        <span data-cell={column.cell}>{value}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
