import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_LINK, normalizeUrl, storedSourceLink } from './normalize-url';
import { ARTICLE, OTHER_ARTICLES, SAME_ARTICLE } from './normalize-url.cases';

const normal = (link: string) => {
  const result = normalizeUrl(link);
  return result.ok ? result.value : result.reason;
};

describe('the news link normalizer on its case table', () => {
  it.each(SAME_ARTICLE)('%s is the same article', (_name, link) => {
    expect(normal(link)).toBe(normal(ARTICLE));
  });

  it.each(OTHER_ARTICLES)('%s is another article', (_name, link) => {
    expect(normal(link)).not.toBe(normal(ARTICLE));
  });

  it('is idempotent on every link in the table', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SAME_ARTICLE, ...OTHER_ARTICLES), ([, link]) => {
        expect(normal(normal(link))).toBe(normal(link));
      }),
    );
  });
});

describe('storedSourceLink', () => {
  it('keeps the link the page ended on while it fits the column', () => {
    expect(storedSourceLink('https://a.example.vn/x', 'https://a.example.vn/y')).toBe('https://a.example.vn/x');
  });

  it('falls back to the cited link when the final address is over the column limit', () => {
    const landed = `https://a.example.vn/${'x'.repeat(MAX_SOURCE_LINK)}`;
    expect(storedSourceLink(landed, 'https://www.a.example.vn/y?utm_source=zalo')).toBe('https://www.a.example.vn/y');
  });
});
