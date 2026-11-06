import type { StatementGrid } from './layouts';

export type HeaderGuessCase = { readonly name: string; readonly grid: StatementGrid; readonly headerRow: number };

/** Files where the header row is not the first row with the most filled cells (#260). */
export const HEADER_GUESS_CASES: readonly HeaderGuessCase[] = [
  {
    name: 'an unnamed column in the header, every line full',
    grid: [
      ['Ngày', 'Nội dung', '', 'Số dư'],
      ['01/03/2026', 'CK tien phong 5', '0', '1500000'],
      ['02/03/2026', 'CK tien phong 6', '0', '3000000'],
    ],
    headerRow: 0,
  },
  {
    name: 'account lines above an unnamed header column',
    grid: [
      ['Tài khoản Demo'],
      ['Từ ngày', '01/03/2026'],
      ['Ngày', 'Nội dung', '', 'Số dư'],
      ['03/03/2026', 'CK tien phong 5', '0', '1500000'],
    ],
    headerRow: 2,
  },
  { name: 'a file with no header at all', grid: [['01/03/2026', 'CK', '0', '15'], ['02/03/2026', 'CK', '0', '16']], headerRow: 0 },
  { name: 'an empty file', grid: [], headerRow: 0 },
  { name: 'a header with a time in a data line', grid: [['Ngày', 'Nội dung', 'Số tiền'], ['01/03/2026 10:11:12', 'CK', '1500000']], headerRow: 0 },
];
