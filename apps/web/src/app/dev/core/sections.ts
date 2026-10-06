import { isoDate } from '@esta/core/date';
import {
  formatArea,
  formatDate,
  formatDateLong,
  formatRelativeDue,
  formatVnd,
  formatVndCompact,
  type Locale,
} from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { compareVietnameseNames, sortKeyVietnameseName } from '@esta/core/names';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseStatementAmount, parseStatementDate } from '@esta/core/parse/statement';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { formatPhone, normalizePhone, phoneForZaloLink, type Phone } from '@esta/core/phone';
import type { Result } from '@esta/core/result';
import { foldVietnamese, matchesSearch } from '@esta/core/search';
import { suggestCurrentUnit } from './suggest';

export type CoreRow = {
  fn: string;
  input: string;
  locale?: Locale;
  expected: string;
  run: () => string | Promise<string>;
};

export type CoreSection = { id: string; title: string; rows: readonly CoreRow[] };

export type CheckedRow = Omit<CoreRow, 'run'> & { actual: string; matches: boolean };

export async function checkRow({ run, ...row }: CoreRow): Promise<CheckedRow> {
  let actual: string;
  try {
    actual = await run();
  } catch (error) {
    actual = `throws ${error instanceof Error ? error.name : 'error'}`;
  }
  return { ...row, actual, matches: actual === row.expected };
}

function shown<T>(result: Result<T, string>): string {
  return result.ok ? String(result.value) : `rejected: ${result.reason}`;
}

function phone(text: string): Phone {
  const result = normalizePhone(text);
  if (!result.ok) throw new TypeError(`Not a phone: ${text}`);
  return result.value;
}

async function suggested(text: string): Promise<string> {
  const rows = await suggestCurrentUnit(text);
  return rows.map((row) => `${row.commune_code} ${row.commune_name} (${row.province_code})`).join(' · ');
}

const ADDRESS_LOOKUPS: readonly [string, string][] = [
  ['Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương', '25942 Phường Dĩ An (79)'],
  ['Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu', '26506 Phường Vũng Tàu (79)'],
  ['Phường 2, Thành phố Tân An, Tỉnh Long An', '27694 Phường Long An (80)'],
  ['Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai', '26188 Phường Tân Triều (75)'],
  ['Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng', '24823 Phường 1 Bảo Lộc (68)'],
  ['Dĩ An, Bình Dương', '25942 Phường Dĩ An (79) · 25945 Phường Tân Đông Hiệp (79) · 25951 Phường Đông Hòa (79)'],
  [
    'Quận 7',
    '27475 Phường Tân Hưng (79) · 27478 Phường Tân Thuận (79) · 27484 Phường Phú Thuận (79) · 27487 Phường Tân Mỹ (79)',
  ],
];

const NBSP = '\u00a0';
const TODAY = isoDate('2026-10-07');

const COMPACT: readonly [number, string, string][] = [
  [3_200_000_000, '3,2 tỷ', '3.2B ₫'],
  [1_250_000_000, '1,25 tỷ', '1.25B ₫'],
  [1_000_000_000, '1 tỷ', '1B ₫'],
  [999_999_999, '1 tỷ', '1B ₫'],
  [15_000_000, '15 tr', '15M ₫'],
  [15_500_000, '15,5 tr', '15.5M ₫'],
  [850_000, '850 nghìn', '850K ₫'],
];

const UNSORTED_NAMES = [
  'Trần Văn Khoa',
  'Phạm Demo Đức',
  'Nguyễn Thị Hường',
  'Võ Demo Dũng',
  'Lý Demo Ánh',
  'Hồ Demo Anh',
];
const SORTED_NAMES = [
  'Hồ Demo Anh',
  'Lý Demo Ánh',
  'Võ Demo Dũng',
  'Phạm Demo Đức',
  'Nguyễn Thị Hường',
  'Trần Văn Khoa',
];

export const sections: readonly CoreSection[] = [
  {
    id: 'money',
    title: 'Money',
    rows: [
      { fn: 'vnd', input: '15000000', expected: '15000000', run: () => String(vnd(15_000_000)) },
      { fn: 'vnd', input: '1.5', expected: 'throws RangeError', run: () => String(vnd(1.5)) },
      { fn: 'vnd', input: '2 ** 53', expected: 'throws RangeError', run: () => String(vnd(2 ** 53)) },
    ],
  },
  {
    id: 'format',
    title: 'Format',
    rows: [
      {
        fn: 'formatVnd',
        input: '15000000',
        locale: 'vi',
        expected: `15.000.000${NBSP}₫`,
        run: () => formatVnd(vnd(15_000_000), 'vi'),
      },
      {
        fn: 'formatVnd',
        input: '15000000',
        locale: 'en',
        expected: `15,000,000${NBSP}₫`,
        run: () => formatVnd(vnd(15_000_000), 'en'),
      },
      ...COMPACT.flatMap(([amount, vi, en]): CoreRow[] => [
        {
          fn: 'formatVndCompact',
          input: String(amount),
          locale: 'vi',
          expected: vi,
          run: () => formatVndCompact(vnd(amount), 'vi'),
        },
        {
          fn: 'formatVndCompact',
          input: String(amount),
          locale: 'en',
          expected: en,
          run: () => formatVndCompact(vnd(amount), 'en'),
        },
      ]),
      { fn: 'formatArea', input: '125.5', locale: 'vi', expected: '125,5 m²', run: () => formatArea(125.5, 'vi') },
      {
        fn: 'formatDate',
        input: '2026-10-07',
        locale: 'vi',
        expected: '07/10/2026',
        run: () => formatDate(TODAY, 'vi'),
      },
      {
        fn: 'formatDateLong',
        input: '2026-10-07',
        locale: 'vi',
        expected: 'Thứ Tư, 07/10/2026',
        run: () => formatDateLong(TODAY, 'vi'),
      },
      {
        fn: 'formatDateLong',
        input: '2026-10-07',
        locale: 'en',
        expected: 'Wednesday, 07/10/2026',
        run: () => formatDateLong(TODAY, 'en'),
      },
      {
        fn: 'formatRelativeDue',
        input: 'due 2026-09-25, today 2026-10-07',
        locale: 'vi',
        expected: 'quá hạn 12 ngày',
        run: () => formatRelativeDue(isoDate('2026-09-25'), TODAY, 'vi'),
      },
      {
        fn: 'formatRelativeDue',
        input: 'due 2026-09-25, today 2026-10-07',
        locale: 'en',
        expected: '12 days overdue',
        run: () => formatRelativeDue(isoDate('2026-09-25'), TODAY, 'en'),
      },
    ],
  },
  {
    id: 'parse',
    title: 'Parse',
    rows: [
      ...(
        [
          ['3tr5', '3500000'],
          ['3,5tr', '3500000'],
          ['3.500.000', '3500000'],
          ['1ty2', '1200000000'],
          ['850k', '850000'],
          ['15 triệu', '15000000'],
          ['1,250 tỷ', '1250000000'],
          ['3,500tr', '3500000'],
          ['3,5', 'rejected: fractional'],
          ['3,500.000', 'rejected: ambiguous_separators'],
          ['1,5ty2', 'rejected: ambiguous_shorthand'],
        ] as const
      ).map(([input, expected]) => ({ fn: 'parseVndInput', input, expected, run: () => shown(parseVndInput(input)) })),
      ...(
        [
          ['07/10/2026', '2026-10-07'],
          ['31/04/2026', 'rejected: impossible'],
        ] as const
      ).map(([input, expected]) => ({ fn: 'parseDateInput', input, expected, run: () => shown(parseDateInput(input)) })),
    ],
  },
  {
    id: 'statement',
    title: 'Bank statement',
    rows: [
      ...(
        [
          ['1.500.000', '1500000'],
          ['1,500,000', '1500000'],
          ['1500000.00', '1500000'],
          ['+1.500.000', '1500000'],
          ['-1.500.000', '-1500000'],
          ['1.500.000,50', 'rejected: fractional'],
        ] as const
      ).map(([input, expected]) => ({
        fn: 'parseStatementAmount',
        input,
        expected,
        run: () => shown(parseStatementAmount(input)),
      })),
      ...['07/10/2026', '07/10/2026 14:32:05', '2026-10-07'].map((input) => ({
        fn: 'parseStatementDate',
        input,
        expected: '2026-10-07',
        run: () => shown(parseStatementDate(input)),
      })),
    ],
  },
  {
    id: 'phone',
    title: 'Phone',
    rows: [
      ...['0903123456', '+84903123456', '84903123456'].map((input) => ({
        fn: 'normalizePhone',
        input,
        expected: '+84903123456',
        run: () => shown(normalizePhone(input)),
      })),
      { fn: 'formatPhone', input: '+84903123456', expected: '0903 123 456', run: () => formatPhone(phone('+84903123456')) },
      {
        fn: 'phoneForZaloLink',
        input: '+84903123456',
        expected: '0903123456',
        run: () => phoneForZaloLink(phone('+84903123456')),
      },
    ],
  },
  {
    id: 'names',
    title: 'Names',
    rows: [
      {
        fn: 'sortKeyVietnameseName',
        input: 'Nguyễn Thị Hường',
        expected: 'Hường Thị Nguyễn',
        run: () => sortKeyVietnameseName('Nguyễn Thị Hường'),
      },
      {
        fn: 'compareVietnameseNames',
        input: UNSORTED_NAMES.join(' · '),
        expected: SORTED_NAMES.join(' · '),
        run: () => [...UNSORTED_NAMES].sort(compareVietnameseNames).join(' · '),
      },
    ],
  },
  {
    id: 'search',
    title: 'Search',
    rows: [
      { fn: 'foldVietnamese', input: 'Đường Dĩ An', expected: 'duong di an', run: () => foldVietnamese('Đường Dĩ An') },
      ...(
        [
          ['di an', 'Dĩ An'],
          ['hop dong', 'Hợp đồng'],
          ['DUONG', 'Đường'],
          ['bao loc so', 'Sổ hồng Bảo Lộc'],
        ] as const
      ).map(([query, text]) => ({
        fn: 'matchesSearch',
        input: `${query} → ${text}`,
        expected: 'true',
        run: () => String(matchesSearch(query, text)),
      })),
    ],
  },
  {
    id: 'address',
    title: 'Address lookup',
    rows: ADDRESS_LOOKUPS.map(([text, expected]) => ({
      fn: 'suggest_current_unit',
      input: text,
      expected,
      run: () => suggested(text),
    })),
  },
];
