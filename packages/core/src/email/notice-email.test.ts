import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { noticeLink, renderNoticeEmail, type NoticeEmailItem } from './notice-email';

const APP = 'https://esta.example.test';
const brief: NoticeEmailItem = { id: 'b1', kind: 'brief', title: 'Hôm nay có hai việc cần làm', date: isoDate('2026-10-07') };
const action: NoticeEmailItem = { id: 'a1', kind: 'action', title: 'Phòng 5, anh Nguyễn Văn Demo còn nợ 3.500.000 ₫', date: isoDate('2026-10-07') };

describe('renderNoticeEmail', () => {
  it('names a brief by its day', () => {
    expect(renderNoticeEmail(brief, 'vi', APP).subject).toBe('Trợ lý: Ghi chú buổi sáng 07/10/2026');
  });

  it('gives an action note a generic subject with no tenant name or amount, though its title names both', () => {
    const { subject } = renderNoticeEmail(action, 'vi', APP);
    expect(subject).toBe('Trợ lý có ghi chú mới cần xem');
    expect(subject).not.toMatch(/Nguyễn|Phòng|3\.500/);
  });

  it('links to the thread at the note, in both parts', () => {
    const { html, text } = renderNoticeEmail(brief, 'vi', `${APP}/`);
    expect(html).toContain('href="https://esta.example.test/assistant?note=b1"');
    expect(text).toContain('Mở tin nhắn: https://esta.example.test/assistant?note=b1');
    expect(noticeLink(APP, 'a b')).toBe('https://esta.example.test/assistant?note=a%20b');
  });

  it('holds the title and one sentence, and nothing of the note body', () => {
    const { text } = renderNoticeEmail(brief, 'vi', APP);
    expect(text).toBe('Trợ lý vừa để lại một ghi chú mới cho bạn.\n\nHôm nay có hai việc cần làm\n\nMở tin nhắn: https://esta.example.test/assistant?note=b1\n');
  });

  it('renders the HTML part', () => {
    expect(renderNoticeEmail(brief, 'vi', APP).html).toMatchInlineSnapshot(`
      "<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trợ lý: Ghi chú buổi sáng 07/10/2026</title></head>
      <body style="margin:0;padding:24px 16px;background:#ffffff;color:#1f2933;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;line-height:1.5">
      <p style="margin:0 0 16px">Trợ lý vừa để lại một ghi chú mới cho bạn.</p>
      <p style="margin:0 0 24px;font-weight:600">Hôm nay có hai việc cần làm</p>
      <a href="https://esta.example.test/assistant?note=b1" style="display:inline-block;min-height:48px;box-sizing:border-box;padding:12px 24px;background:#1d4ed8;color:#ffffff;border-radius:8px;font-weight:600;text-decoration:none;line-height:24px">Mở tin nhắn</a>
      </body></html>"
    `);
  });

  it('normalizes a decomposed title to NFC', () => {
    const decomposed = 'Hường'.normalize('NFD');
    expect(decomposed).not.toBe('Hường');
    const { html, text, subject } = renderNoticeEmail({ ...brief, title: `Chị ${decomposed}` }, 'vi', APP);
    for (const part of [html, text, subject]) expect(part).toBe(part.normalize('NFC'));
    expect(text).toContain('Chị Hường');
  });

  it('keeps the title in Vietnamese inside English chrome', () => {
    const { subject, text, html } = renderNoticeEmail(action, 'en', APP);
    expect(subject).toBe('The assistant left a new note to look at');
    expect(text).toContain('The assistant just left you a new note.');
    expect(text).toContain('Phòng 5, anh Nguyễn Văn Demo');
    expect(html).toContain('lang="en"');
    expect(html).toContain('>Open message</a>');
    expect(renderNoticeEmail(brief, 'en', APP).subject).toBe('Assistant: Morning note 07/10/2026');
  });

  it('escapes markup in a title', () => {
    const { html, text } = renderNoticeEmail({ ...brief, title: '<script>alert("x")</script> & co' }, 'vi', APP);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
    expect(text).toContain('<script>');
  });
});
