/** The contexts in which a number word states no figure (P5-10d), written out apart from the word table that implements them. */
export type NonQuantityContext = { readonly word: string; readonly text: string; readonly ends: boolean };

const parties = (acts: readonly string[]): NonQuantityContext[] => acts.map((act) => ({ word: 'hai', text: `hai bên ${act}`, ends: false }));
const both = (acts: readonly string[]): NonQuantityContext[] => acts.map((act) => ({ word: 'hai', text: `cả hai ${act}`, ends: false }));

export const NON_QUANTITY_CONTEXTS: readonly NonQuantityContext[] = [
  ...parties(['cùng', 'đều', 'tự', 'thỏa', 'đồng ý', 'ký', 'thống', 'xác', 'phải', 'cần', 'có', 'sẽ', 'nên', 'mang', 'chịu', 'nộp', 'lập', 'được', 'đã', 'không']),
  ...both(['đều', 'cùng', 'đã', 'không', 'phải', 'có', 'sẽ', 'cũng', 'nên', 'thì']),
  { word: 'hai', text: 'giữa hai bên', ends: false },
  { word: 'hai', text: 'của hai bên', ends: false },
  { word: 'hai', text: 'cả hai bên', ends: false },
  { word: 'hai', text: 'cả hai', ends: true },
  { word: 'ba', text: 'ba mẹ', ends: false },
  { word: 'ba', text: 'ba hoặc mẹ', ends: false },
  { word: 'ba', text: 'ba và mẹ', ends: false },
  { word: 'ba', text: 'mẹ hoặc ba', ends: false },
  { word: 'ba', text: 'mẹ và ba', ends: false },
];
