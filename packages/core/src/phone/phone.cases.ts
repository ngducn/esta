/** `phone` null means the text is refused; `mobile` says whether a Zalo chat can open on it. */
export type PhoneCase = { readonly name: string; readonly text: string; readonly phone: string | null; readonly mobile?: boolean };

export const PHONE_CASES: readonly PhoneCase[] = [
  { name: 'a local mobile', text: '0903123456', phone: '+84903123456', mobile: true },
  { name: 'a mobile with country code and a trunk zero', text: '+84 0903 123 456', phone: '+84903123456', mobile: true },
  { name: 'a mobile with brackets', text: '(+84) 903-123-456', phone: '+84903123456', mobile: true },
  { name: 'a mobile with the 0084 prefix', text: '0084903123456', phone: '+84903123456', mobile: true },
  { name: 'a mobile with a leading space and dots', text: ' 0903.123.456 ', phone: '+84903123456', mobile: true },
  { name: 'an 08 mobile', text: '0840123456', phone: '+84840123456', mobile: true },
  { name: 'a Hồ Chí Minh landline', text: '028 3823 4567', phone: '+842838234567', mobile: false },
  { name: 'a Đồng Nai landline from the Zalo issue', text: '+84 251 382 4567', phone: '+842513824567', mobile: false },
  { name: 'a landline with a country code', text: '842838234567', phone: '+842838234567', mobile: false },
  { name: 'an empty cell', text: '', phone: null },
  { name: 'only spaces', text: '   ', phone: null },
  { name: 'a number with a letter', text: '09031234x6', phone: null },
  { name: 'nine digits', text: '090312345', phone: null },
  { name: 'eleven digits', text: '09031234567', phone: null },
  { name: 'no leading zero', text: '903123456', phone: null },
  { name: 'a reserved prefix', text: '0103123456', phone: null },
  { name: 'a foreign number', text: '+1 415 555 0100', phone: null },
  { name: 'a number with an extension', text: '0903123456 ext 12', phone: null },
  { name: 'two numbers in one cell', text: '0903123456 / 0903123457', phone: null },
  { name: 'Arabic-Indic digits', text: '٠٩٠٣١٢٣٤٥٦', phone: null },
];
