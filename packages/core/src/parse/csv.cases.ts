export type CsvCase = {
  readonly name: string;
  readonly text: string;
  readonly spanLines: boolean;
  readonly rows: readonly (readonly string[])[];
};

/** Headers and rows a bank, Excel or a hand-edited file may produce; the second row is read under the header's separator. */
export const CSV_CASES: readonly CsvCase[] = [
  { name: 'a quoted header holding a comma, read with commas', text: '"Số tiền, VND",Mô tả\n1,2', spanLines: false, rows: [['Số tiền, VND', 'Mô tả'], ['1', '2']] },
  { name: 'a quoted header holding commas, read with semicolons', text: '"Số tiền, VND, tổng";Mô tả\n1;2', spanLines: false, rows: [['Số tiền, VND, tổng', 'Mô tả'], ['1', '2']] },
  { name: 'a quoted header holding a semicolon, read with commas', text: '"Ngày; giờ",Số tiền\n1,2', spanLines: false, rows: [['Ngày; giờ', 'Số tiền'], ['1', '2']] },
  { name: 'a quoted header holding a tab', text: '"Số\ttiền";Mô tả\n1;2', spanLines: false, rows: [['Số\ttiền', 'Mô tả'], ['1', '2']] },
  { name: 'doubled quotes in a header', text: '"Tên ""gọi""";Số\n1;2', spanLines: false, rows: [['Tên "gọi"', 'Số'], ['1', '2']] },
  { name: 'a header with a line break in a quoted cell', text: '"Số\ntiền";Mô tả\n1;2', spanLines: true, rows: [['Số\ntiền', 'Mô tả'], ['1', '2']] },
  { name: 'a header with a line break and commas in a quoted cell', text: '"Số,\ntiền,x";Mô tả\n1;2', spanLines: true, rows: [['Số,\ntiền,x', 'Mô tả'], ['1', '2']] },
  { name: 'plain semicolons with commas in decimals', text: 'Ngày;Số tiền\n01/01/2026;1.500,5', spanLines: false, rows: [['Ngày', 'Số tiền'], ['01/01/2026', '1.500,5']] },
  { name: 'tabs from a pasted sheet', text: 'Ngày\tSố tiền\n01/01/2026\t1,500', spanLines: false, rows: [['Ngày', 'Số tiền'], ['01/01/2026', '1,500']] },
  { name: 'a bom and CRLF on a quoted header', text: '\uFEFF"A;B";C\r\n1;2\r\n', spanLines: false, rows: [['A;B', 'C'], ['1', '2']] },
];
