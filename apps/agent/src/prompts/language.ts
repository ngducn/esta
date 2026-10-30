/**
 * Words that show a message is English. None is a Vietnamese syllable typed without its marks, so `can` (cần), `do`,
 * `the` (thế), `to`, `in`, `on`, `no` (nó), `me` (mẹ), `my` (Mỹ) and `an` (Dĩ An) are left out.
 */
const ENGLISH = new Set(
  'what which who whom whose when where why how is are was were did does have has had will would should could please of for this that these those with from about your our their tell show write give make send draft paid pay rent rents rented tenant tenants lease leases room rooms late overdue month months year years instead by much many most often any some there it you all if or but than into be been not and help money owe owed owes due bill bills'.split(' '),
);

/** Common Vietnamese words, with and without their marks, so a message typed either way reads as Vietnamese. */
const VIETNAMESE = new Set(
  'không khong có co là la của cua và va bao nhiêu nhieu nào nao gì gi thì thi được duoc cho này nay đã da chưa chua nên nen hay với voi các cac những nhung tôi toi mẹ ạ ơi oi thu tiền tien tháng thang năm nam viết viet tin nhắn nhan đóng dong nhắc nhac gia hạn han hợp hop đồng dong bạn ban sao thế ai đâu dau giờ gio cần can muốn muon làm lam giúp giup hỏi hoi trả tra từ tu ở trong lại lai rồi roi khách khach thuê thue'.split(' '),
);

/** Whether a message is written in English: more English words than Vietnamese ones, so a tie stays Vietnamese. */
export function writtenInEnglish(message: string): boolean {
  const words = message.normalize('NFC').toLowerCase().match(/\p{L}+/gu) ?? [];
  const english = words.filter((word) => ENGLISH.has(word)).length;
  const vietnamese = words.filter((word) => VIETNAMESE.has(word)).length;
  return english > vietnamese;
}
