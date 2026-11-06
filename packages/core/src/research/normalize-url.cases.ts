/** Links that name one article; `same` shares a normalized form with `article`, `other` does not. */
export const ARTICLE = 'https://tintuc.example.vn/bai-viet/gia-dat-tang';

export const SAME_ARTICLE: readonly (readonly [name: string, link: string])[] = [
  ['an amp path segment before the slug', 'https://tintuc.example.vn/amp/bai-viet/gia-dat-tang'],
  ['an amp path segment last', 'https://tintuc.example.vn/bai-viet/gia-dat-tang/amp'],
  ['an amp path segment last with a slash', 'https://tintuc.example.vn/bai-viet/gia-dat-tang/amp/'],
  ['an amp path segment in capitals', 'https://tintuc.example.vn/AMP/bai-viet/gia-dat-tang'],
  ['an amp host', 'https://amp.tintuc.example.vn/bai-viet/gia-dat-tang'],
  ['a www and amp host', 'https://www.tintuc.example.vn/bai-viet/gia-dat-tang?amp'],
  ['an amp query', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?amp=1'],
  ['an amp query with tracking', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?amp&utm_source=zalo'],
  ['an output=amp query', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?output=amp'],
  ['an outputType=amp query', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?outputType=amp'],
  ['an amp suffix on the slug', 'https://tintuc.example.vn/bai-viet/gia-dat-tang.amp'],
  ['a fragment and a trailing slash', 'https://tintuc.example.vn/bai-viet/gia-dat-tang/#binh-luan'],
];

export const OTHER_ARTICLES: readonly (readonly [name: string, link: string])[] = [
  ['a slug that merely contains amp', 'https://tintuc.example.vn/bai-viet/ampere'],
  ['a different query value for output', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?output=json'],
  ['a different page query', 'https://tintuc.example.vn/bai-viet/gia-dat-tang?page=2'],
  ['a host that merely starts with amp', 'https://ampere.example.vn/bai-viet/gia-dat-tang'],
];
