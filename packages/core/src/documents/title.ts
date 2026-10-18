/** [app rule] Kind words that open a nickname. They are dropped from a prefilled title, so `Đất vườn Long An` gives `Sổ hồng Long An`. */
const KIND_WORDS = ['Đất vườn', 'Đất', 'Nhà phố', 'Nhà', 'Căn hộ', 'Dãy trọ', 'Phòng trọ', 'Mặt bằng', 'Kho', 'Xưởng'] as const;

export function placeName(nickname: string): string {
  const name = nickname.normalize('NFC').trim();
  const kind = KIND_WORDS.find((word) => name.toLocaleLowerCase('vi').startsWith(`${word.toLocaleLowerCase('vi')} `));
  const rest = kind === undefined ? name : name.slice(kind.length).trim();
  return rest === '' ? name : rest;
}

/** The title the upload sheet prefills: the category's short name and the place, such as `Sổ hồng Bảo Lộc`. */
export function defaultDocumentTitle(prefix: string, nickname: string | null): string {
  return nickname === null ? prefix : `${prefix} ${placeName(nickname)}`;
}
