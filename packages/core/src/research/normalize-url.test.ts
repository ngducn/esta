import { describe, expect, it } from 'vitest';
import { fetchKey, normalizeUrl } from './normalize-url';

const normal = (raw: string) => {
  const result = normalizeUrl(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
};

describe('normalizeUrl (AGENT.md §5.2)', () => {
  it('drops tracking parameters and keeps the others, sorted', () => {
    expect(normal('https://tintuc.example.vn/bai-viet?utm_source=fb&utm_medium=social&fbclid=abc&zarsrc=30')).toBe('https://tintuc.example.vn/bai-viet');
    expect(normal('https://tintuc.example.vn/bai-viet?page=2&id=7&gclid=x')).toBe('https://tintuc.example.vn/bai-viet?id=7&page=2');
  });

  it('drops www., the fragment and a trailing slash, and lowercases the host', () => {
    expect(normal('https://WWW.Example.vn/Tin-Tuc/vanh-dai/#binh-luan')).toBe('https://example.vn/Tin-Tuc/vanh-dai');
    expect(normal('https://www.example.vn/')).toBe('https://example.vn');
    expect(normal('  https://example.vn/a//  ')).toBe('https://example.vn/a');
  });

  it('reads two links to one article as the same', () => {
    expect(normal('https://www.example.vn/a/?utm_campaign=x#top')).toBe(normal('https://example.vn/a'));
  });

  it('keeps a non-default port and the path case', () => {
    expect(normal('https://example.vn:8443/Bai')).toBe('https://example.vn:8443/Bai');
  });

  it('refuses a link that is not https, and text that is not a link', () => {
    expect(normalizeUrl('http://example.vn/a')).toEqual({ ok: false, reason: 'not_https' });
    expect(normalizeUrl('ftp://example.vn/a')).toEqual({ ok: false, reason: 'not_https' });
    expect(normalizeUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'not_url' });
    expect(normalizeUrl('example.vn/a')).toEqual({ ok: false, reason: 'not_url' });
  });
});

describe('fetchKey (#323)', () => {
  it('folds host case, www, port 443, a trailing slash and the fragment, and keeps every query parameter', () => {
    expect(fetchKey('https://WWW.Tin.example.vn:443/a/?utm_source=zalo#top')).toEqual({ ok: true, value: 'https://tin.example.vn/a?utm_source=zalo' });
    expect(fetchKey('https://tin.example.vn/a?ref=x')).not.toEqual(fetchKey('https://tin.example.vn/a'));
  });

  it('refuses a link with userinfo, or one that is not https', () => {
    expect(fetchKey('https://leak:x@tin.example.vn/a')).toEqual({ ok: false, reason: 'userinfo' });
    expect(fetchKey('http://tin.example.vn/a')).toEqual({ ok: false, reason: 'not_https' });
  });
});
