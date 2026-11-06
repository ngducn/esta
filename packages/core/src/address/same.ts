const comparable = (address: string) => address.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi');

/** Two printed addresses are the same when they differ only in Unicode form, spacing or letter case. */
export function sameAddress(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}
