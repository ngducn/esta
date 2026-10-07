export const glyphTestString =
  'Đặng Thị Hường, Nguyễn Văn Ước, Phường Dĩ An, Thửa đất số 1234, tờ bản đồ số 56. ẫ ặ ữ ỡ ự ể ộ ổ ỗ ờ ở ợ ụ ủ ứ ừ ử ữ ỳ ỷ ỹ Ỵ. 0123456789 ₫ m² ½';

const vowels = 'aăâeêioôơuưy';
/** No mark, then the five tone marks: huyền, hỏi, ngã, sắc, nặng. */
const tones = ['', '̀', '̉', '̃', '́', '̣'];

/** Every Vietnamese letter as a precomposed code point: each vowel with each tone in both cases, plus đ and Đ. */
export const vietnameseLetters: readonly string[] = [
  ...[...vowels].flatMap((vowel) => tones.map((tone) => `${vowel}${tone}`.normalize('NFC'))).flatMap((letter) => [letter, letter.toUpperCase()]),
  'đ',
  'Đ',
];
