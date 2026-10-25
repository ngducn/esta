import { describe, expect, it } from 'vitest';
import { noteCitations } from './citations';

const stored = { url: 'https://tintuc.example.vn/vanh-dai-3', source_name: 'Tin tức Demo', published_at: '2026-10-05' };

describe('noteCitations', () => {
  it('keeps every valid entry beside one that is not, and drops the bad one alone', () => {
    const fetched = { url: 'https://baodemo.example.vn/gia-thue', source_name: 'baodemo.example.vn', published_at: null };
    expect(noteCitations([stored, { url: 'http://tintuc.example.vn/cu', source_name: 'Tin cũ', published_at: null }, { url: 'javascript:alert(1)', source_name: 'x' }, 'text', fetched])).toEqual([
      { url: stored.url, sourceName: 'Tin tức Demo', publishedOn: '2026-10-05' },
      { url: fetched.url, sourceName: 'baodemo.example.vn', publishedOn: null },
    ]);
  });

  it('reads a bad date as no date, and anything but a list as no chips', () => {
    expect(noteCitations([{ ...stored, published_at: '05/10/2026' }])).toEqual([{ url: stored.url, sourceName: 'Tin tức Demo', publishedOn: null }]);
    expect(noteCitations(null)).toEqual([]);
    expect(noteCitations({ url: stored.url })).toEqual([]);
  });
});
