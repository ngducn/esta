export type CurrentAddressLineParts = { readonly houseNo?: string | null; readonly street?: string | null };

const clean = (part: string | null | undefined) => (part ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

/** The stored `current_address.line`: house number then street, as Mẹ reads it on a gate (`901 Demo Đường số 15`). */
export function formatCurrentAddress({ houseNo, street }: CurrentAddressLineParts): string | null {
  const line = [clean(houseNo), clean(street)].filter((part) => part !== '').join(' ');
  return line === '' ? null : line;
}

/** The name people say: "Thành phố Hồ Chí Minh" reads "TP. Hồ Chí Minh", "Tỉnh Bình Dương" reads "Bình Dương". */
export function shortProvinceName(name: string): string {
  return name.normalize('NFC').replace(/^Thành phố\s+/u, 'TP. ').replace(/^Tỉnh\s+/u, '');
}
