import type { Metadata } from 'next';
import { LiveParse } from './live-parse';
import { checkRow, sections } from './sections';

export const metadata: Metadata = {
  title: 'Core playground',
};

const COLUMNS = ['Function', 'Input', 'Locale', 'Expected', 'Actual', 'Result'];

export default function DevCorePage() {
  const checked = sections.map((section) => ({ ...section, rows: section.rows.map(checkRow) }));
  const rows = checked.flatMap((section) => section.rows);
  const mismatches = rows.filter((row) => !row.matches).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Core playground</h1>
        <p data-testid="core-summary">
          {rows.length} checks, {mismatches} {mismatches === 1 ? 'mismatch' : 'mismatches'}
        </p>
      </header>

      <LiveParse />

      {checked.map((section) => (
        <section key={section.id} aria-labelledby={`${section.id}-heading`} data-section={section.id}>
          <h2 id={`${section.id}-heading`} className="mb-2 text-lg font-semibold">
            {section.title}
          </h2>
          <table className="w-full text-left text-sm wrap-anywhere">
            <thead>
              <tr className="border-b">
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="py-1 pr-2 sm:pr-4">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {section.rows.map((row, index) => (
                <tr
                  key={index}
                  className="border-b align-top"
                  data-fn={row.fn}
                  data-input={row.input}
                  data-locale={row.locale}
                >
                  <td className="py-1 pr-2 font-mono sm:pr-4">{row.fn}</td>
                  <td className="py-1 pr-2 sm:pr-4">{row.input}</td>
                  <td className="py-1 pr-2 sm:pr-4">{row.locale ?? ''}</td>
                  <td className="py-1 pr-2 sm:pr-4" data-cell="expected">
                    {row.expected}
                  </td>
                  <td className="py-1 pr-2 sm:pr-4" data-cell="actual">
                    {row.actual}
                  </td>
                  <td className="py-1 font-semibold" data-cell="result">
                    {row.matches ? 'OK' : 'MISMATCH'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
