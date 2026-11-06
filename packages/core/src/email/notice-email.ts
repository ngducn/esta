import type { IsoDate } from '../date/iso-date';
import { formatDate, type Locale } from '../format';
import type { NoticeKind } from '../notify/recipients';

export type NoticeEmailItem = {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly title: string;
  /** The business day a brief is for; an action note's subject names no date. */
  readonly date: IsoDate;
};

export type NoticeEmail = { readonly subject: string; readonly html: string; readonly text: string };

const CHROME = {
  vi: { brief: (date: string) => `Trợ lý: Ghi chú buổi sáng ${date}`, action: 'Trợ lý có ghi chú mới cần xem', lead: 'Trợ lý vừa để lại một ghi chú mới cho bạn.', open: 'Mở tin nhắn' },
  en: { brief: (date: string) => `Assistant: Morning note ${date}`, action: 'The assistant left a new note to look at', lead: 'The assistant just left you a new note.', open: 'Open message' },
} as const satisfies Record<Locale, { brief(date: string): string; action: string; lead: string; open: string }>;

const INK = '#1f2933';
const PAPER = '#ffffff';
const ACCENT = '#1d4ed8';
const ON_ACCENT = '#ffffff';

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** The link a notice opens: the thread, at the note, which sign-in's return link keeps. */
export function noticeLink(appUrl: string, noteId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/assistant?note=${encodeURIComponent(noteId)}`;
}

/**
 * A notice, never the note: the subject and body hold no tenant name or amount, since a lock screen and a mail list show
 * them, and the body holds the note's title only (AGENT.md §10). The chrome follows the member's language and the title
 * stays in the household's.
 */
export function renderNoticeEmail(item: NoticeEmailItem, locale: Locale, appUrl: string): NoticeEmail {
  const words = CHROME[locale];
  const subject = (item.kind === 'brief' ? words.brief(formatDate(item.date, locale)) : words.action).normalize('NFC');
  const title = item.title.normalize('NFC');
  const lead = words.lead.normalize('NFC');
  const open = words.open.normalize('NFC');
  const link = noticeLink(appUrl, item.id);
  const html = [
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:24px 16px;background:${PAPER};color:${INK};font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;line-height:1.5">`,
    `<p style="margin:0 0 16px">${escapeHtml(lead)}</p>`,
    `<p style="margin:0 0 24px;font-weight:600">${escapeHtml(title)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;min-height:48px;box-sizing:border-box;padding:12px 24px;background:${ACCENT};color:${ON_ACCENT};border-radius:8px;font-weight:600;text-decoration:none;line-height:24px">${escapeHtml(open)}</a>`,
    '</body></html>',
  ].join('\n');
  const text = `${lead}\n\n${title}\n\n${open}: ${link}\n`;
  return { subject, html: html.normalize('NFC'), text: text.normalize('NFC') };
}
