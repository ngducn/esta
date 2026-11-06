import { join } from 'node:path';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../../src/replay/store';
import { pruneCaseRecordings } from './prune-cases';
import { askRecording, askRepairRecording, PAGE_TEXT, quotePage, RATE_URL, webFetch, webSearch, type AskCase } from './ask-cases';

const MORE_SEARCHES = ['lãi suất vay mua nhà ngân hàng nhà nước', 'lãi suất vay mua nhà thả nổi', 'lãi suất vay mua nhà ưu đãi', 'lãi suất vay mua nhà cố định'];

const searches = (count: number, first: ReturnType<typeof webSearch>) => [first, ...MORE_SEARCHES.slice(0, count - 1).map((query) => webSearch(query))];

/** The model searches five times in one turn: the fifth is denied and the answer arrives all the same (lane 9). */
export const OVER_CAP_CASE: AskCase = {
  id: 'ask-web-over-cap',
  question: 'Lãi suất vay mua nhà bây giờ khoảng bao nhiêu?',
  toolCalls: [...searches(5, webSearch('lãi suất vay mua nhà hiện nay', RATE_URL)), webFetch(RATE_URL, PAGE_TEXT[RATE_URL]), quotePage(RATE_URL, ['Lãi suất cho vay mua nhà từ 7,5% một năm'])],
  reply: 'Theo {{f1.source_name}}, bài đăng ngày {{f1.published_display}}: "{{f1.quote_1_label}}".\n\nĐây chỉ là mức tham khảo, mỗi ngân hàng có thể áp dụng khác nhau.',
};

/** Four searches find no official page; the source repair turn tries a fifth, which the turn's cap denies, and opens a page the first session's search returned. */
export const OVER_CAP_REPAIR_CASE: AskCase = {
  id: 'ask-web-over-cap-repair',
  question: 'Nghị định mới nhất về thuế cho thuê nhà là gì?',
  toolCalls: searches(4, webSearch('nghị định mới nhất về thuế cho thuê nhà', RATE_URL)),
  reply: 'Trợ lý chưa tìm thấy trang nào để dẫn cho câu này.',
  repairToolCalls: [webSearch('nghị định thuế cho thuê nhà mới'), webFetch(RATE_URL, PAGE_TEXT[RATE_URL])],
  repairReply: 'Trợ lý vẫn chưa tìm thấy trang chính thức nào cho câu này.',
};

export const OVER_CAP_REPLAY_DIR = join(DEFAULT_REPLAY_DIR, '..', 'agent-replay-cases', 'ask-web-over-cap');


if (import.meta.main) {
  pruneCaseRecordings(OVER_CAP_REPLAY_DIR, [OVER_CAP_CASE.id, OVER_CAP_REPAIR_CASE.id]);
  for (const item of [OVER_CAP_CASE, OVER_CAP_REPAIR_CASE]) {
    console.log(writeRecording(OVER_CAP_REPLAY_DIR, await askRecording(item)));
    if (item.repairReply !== undefined) console.log(writeRecording(OVER_CAP_REPLAY_DIR, await askRepairRecording(item)));
  }
}
