import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { CronStatusLine } from './cron-status-line';

describe('CronStatusLine', () => {
  it('renders nothing when every nightly job is healthy', () => {
    expect(renderInLocale(<CronStatusLine health={{ kind: 'ok' }} />, 'vi').queryByRole('group')).toBeNull();
  });

  it('names the failed and the stale jobs in Vietnamese', () => {
    const view = renderInLocale(<CronStatusLine health={{ kind: 'attention', failed: ['invoices'], stale: ['document_sweep', 'keep_alive'] }} />, 'vi');
    expect(view.getByRole('group').textContent).toBe(
      'Việc chạy mỗi đêm bị lỗi lần gần nhất: lập hóa đơn.Việc chạy mỗi đêm không chạy xong trong 26 giờ qua: dọn tệp tài liệu, giữ cơ sở dữ liệu hoạt động.',
    );
  });

  it('reads a stale job in English and omits the failed line', () => {
    const view = renderInLocale(<CronStatusLine health={{ kind: 'attention', failed: [], stale: ['lease_status'] }} />, 'en');
    expect(view.getByRole('group').textContent).toBe('A nightly job has not finished in the last 26 hours: ending expired leases.');
  });
});
