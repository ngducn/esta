import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeFromText, latestCode, type Mailbox } from './inbucket-code.ts';

const template = readFileSync(join(import.meta.dirname, '..', 'supabase', 'templates', 'otp.html'), 'utf8');

function mailText(code: string): string {
  return template
    .replace('{{ .Token }}', code)
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

type Stored = { id: string; created: string; text: string };

function fakeMailbox(messages: Stored[]): Mailbox {
  const fetchFake = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.includes('/search?')) {
      return Response.json({ messages: messages.map(({ id, created }) => ({ ID: id, Created: created })) });
    }
    const id = url.slice(url.lastIndexOf('/') + 1);
    const found = messages.find((message) => message.id === id);
    return Response.json({ Subject: 'Mã đăng nhập Esta', Text: found?.text ?? '', HTML: '' });
  };
  return { api: 'http://127.0.0.1:55624/api/v1', fetch: fetchFake as typeof fetch };
}

describe('codeFromText', () => {
  it('extracts the code from the Vietnamese template body', () => {
    const text = mailText('482913');
    expect(text).toContain('Mã đăng nhập Esta của bạn');
    expect(codeFromText(text, 'me.lane1@demo.esta.test')).toBe('482913');
  });

  it('refuses a body with no single code', () => {
    expect(() => codeFromText('Mã đăng nhập Esta của bạn:', 'me.lane1@demo.esta.test')).toThrow(
      /one 6-digit code in the mail to me\.lane1@demo\.esta\.test, found 0/,
    );
  });
});

describe('latestCode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks the newest of two messages whatever order the search returns', async () => {
    const mailbox = fakeMailbox([
      { id: 'old', created: '2026-10-07T02:00:00.000Z', text: mailText('111111') },
      { id: 'new', created: '2026-10-07T02:00:05.000Z', text: mailText('222222') },
    ]);
    expect(await latestCode('ryan.lane3@demo.esta.test', mailbox)).toBe('222222');
  });

  it('fails with the mailbox name when no mail arrives in 10 s', async () => {
    const result = latestCode('me.lane9@demo.esta.test', fakeMailbox([]));
    const settled = expect(result).rejects.toThrow('No mail reached me.lane9@demo.esta.test');
    await vi.advanceTimersByTimeAsync(9_900);
    let pending = true;
    void result.catch(() => (pending = false));
    await Promise.resolve();
    expect(pending, 'still polling before 10 s').toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    await settled;
  });

  it('waits for a mail that arrives after the first poll', async () => {
    const messages: Stored[] = [];
    const result = latestCode('new.lane4@demo.esta.test', fakeMailbox(messages));
    await vi.advanceTimersByTimeAsync(1_000);
    messages.push({ id: 'late', created: '2026-10-07T02:00:00.000Z', text: mailText('333333') });
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe('333333');
  });
});
