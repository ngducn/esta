import { describe, expect, it } from 'vitest';
import { checkNote } from './index';
import { WORDS } from './words';

/** The words main's table judges (P5-10d), written out here so a deleted or re-kinded row fails this test. */
const MAIN: Record<string, string[]> = {
  amount: "b bil billion billions bn chuc chục cành củ grand hundred hundreds k lít m mil million millions mio mln mm mn ngan nghin nghìn ngàn score thousand thousands ti tr tram trd trieu trillion trillions triệu trăm trđ ty tỉ tỏi tỷ vạn xị".split(" "),
  currency: "bp bps cent cents d dollar dollars dong dongs eur euro euros pct percent percentage pp usd vnd vnđ xu đ đô đồng".split(" "),
  number: "ba billionth bảy bẩy bốn chín double dozen dozens eight eighteen eighteenth eighth eighty eleven eleventh fifteen fifteenth fifth fifty five fivefold forty four fourfold fourteen fourteenth fourth hai half halves hundredfold hundredth hăm linh lăm lẻ millionth mươi mười mốt một nhì nhăm nhất nil nine nineteen nineteenth ninety ninth nought năm nửa quarter quarters rưởi rưỡi second seven seventeen seventeenth seventh seventy six sixteen sixteenth sixth sixty sáu ten tenfold tenth third thirteen thirteenth thirtieth thirty thousandfold thousandth three threefold thrice triple twelfth twelve twentieth twenty twice two twofold tá tám tư zero đôi".split(" "),
  date: "apr april aug august chạp dec december feb february fortnight friday giêng jan january jul july jun june mar march may monday nhật nov november oct october rằm saturday sep sept september sunday thursday tuesday wednesday".split(" "),
};

const rejects = (note: string) => !checkNote(note, new Map(), 'markdown').ok;

describe('the words table is never looser than main', () => {
  it.each(Object.entries(MAIN))('still judges every %s word, with the same kind', (kind, words) => {
    expect(words.filter((word) => WORDS.get(word)?.kind !== kind)).toEqual([]);
  });

  // The pass-through fields a sentence can reach: each passes the word in one named neighbour only.
  it.each([
    ['passesBeforeName: from May Demo', 'Thư from May Demo.', 'Thư from May.'],
    ['countedAfter: cả năm + classifier', 'Cả năm khách ở đây.', 'Cả năm phòng ở đây.'],
  ])('%s passes only its own sentence', (_field, passing, failing) => {
    expect(rejects(passing), passing).toBe(false);
    expect(rejects(failing), failing).toBe(true);
  });

  it('holds no phrase that lets a number word through (#496)', () => {
    expect([...WORDS].filter(([, row]) => 'passesAfterPhrase' in row)).toEqual([]);
    for (const note of ['Phòng của khách là số một.', 'Tầng này là số một.', 'Căn trống là số một.', 'Bảo hiểm cho bên thứ ba.', 'An toàn là ưu tiên số một.', 'Mối lo số một là tiền thuê.']) {
      expect(rejects(note), note).toBe(true);
    }
  });

  it('judges every trăm, as main does', () => {
    for (const note of ['Phí là một<br>phần trăm', 'Phí là một <br> phần trăm', 'Thuế là không <br/>phần trăm', 'Phí là một <i>phần trăm</i>', 'Phí là một x phần trăm', 'Tính theo phần trăm tiền thu.']) {
      expect(rejects(note), note).toBe(true);
    }
  });
});
