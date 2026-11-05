import { workerStatus } from '@esta/core/agent';
import { parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { WorkerStatusLine } from './worker-status-line';

const now = parseInstant('2026-10-07T09:06:00+07:00');
const line = (lastSeenAt: string | null, locale: 'vi' | 'en' = 'vi', usageLimited = false) =>
  renderInLocale(<WorkerStatusLine status={workerStatus(lastSeenAt === null ? null : { lastSeenAt: parseInstant(lastSeenAt), usageLimited }, now)} />, locale)
    .getByTestId('worker-status').textContent;

describe('WorkerStatusLine', () => {
  it('reads online with the heartbeat time', () => {
    expect(line('2026-10-07T09:06:00+07:00')).toBe('Trợ lý đang hoạt động. Cập nhật lúc 09:06.');
  });

  it('reads offline from the last heartbeat once it is older than 5 minutes', () => {
    expect(line('2026-10-07T09:00:00+07:00')).toBe('Trợ lý nghỉ từ 09:00. Việc mới sẽ được làm khi Trợ lý chạy lại; mọi thứ khác vẫn dùng bình thường.');
  });

  it('adds the date when the last heartbeat was on an earlier day', () => {
    expect(line('2026-10-06T21:30:00+07:00')).toBe('Trợ lý nghỉ từ 21:30 06/10/2026. Việc mới sẽ được làm khi Trợ lý chạy lại; mọi thứ khác vẫn dùng bình thường.');
  });

  it('reads never connected with no heartbeat', () => {
    expect(line(null)).toBe('Trợ lý chưa chạy lần nào. Việc mới sẽ được làm khi Trợ lý chạy; mọi thứ khác vẫn dùng bình thường.');
  });

  it('reads paused while the worker beats after a usage limit', () => {
    expect(line('2026-10-07T09:06:00+07:00', 'vi', true)).toBe('Trợ lý nghỉ vì hết hạn mức. Việc mới sẽ được làm khi hạn mức mở lại.');
  });

  it('reads online in English', () => {
    expect(line('2026-10-07T09:06:00+07:00', 'en')).toBe('Assistant is online. Updated at 09:06.');
  });
});
