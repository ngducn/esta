import { describe, expect, test } from 'vitest';
import fixture from '../../../../fixtures/maps/links.json';
import { isInVietnam } from './bounds';
import { parseMapsUrl, toLatLng } from './parse-maps-url';

describe('parseMapsUrl over fixtures/maps/links.json', () => {
  test.each(fixture.cases.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    expect(parseMapsUrl(row.input)).toEqual(row.parse);
  });
});

describe('the DOMAIN-VN §9 rows', () => {
  test('!3d and !4d give a place point even when @ disagrees', () => {
    const parsed = parseMapsUrl('https://www.google.com/maps/place/X/@1.5,100.5,9z/data=!3d10.7769!4d106.7009');
    expect(parsed).toMatchObject({ kind: 'point', source: 'place', point: { lat: 10.7769, lng: 106.7009 } });
  });

  test('negative coordinates parse', () => {
    expect(parseMapsUrl('https://www.google.com/maps?q=-33.8568,151.2153')).toMatchObject({
      kind: 'point',
      point: { lat: -33.8568, lng: 151.2153 },
      outsideVietnam: true,
    });
  });

  test('longitude 181 is out of range', () => {
    expect(parseMapsUrl('https://www.google.com/maps/@10.7,181,17z')).toEqual({ kind: 'invalid', reason: 'out_of_range' });
  });

  test('a short link in a sentence drops the trailing period', () => {
    expect(parseMapsUrl('Xem ở đây https://maps.app.goo.gl/DemoAbc.')).toEqual({
      kind: 'short_link',
      url: 'https://maps.app.goo.gl/DemoAbc',
    });
  });

  test('100k trailing punctuation characters return within a few ms', () => {
    const input = `https://a${'.'.repeat(100_000)}x`;
    const started = Date.now();

    const parsed = parseMapsUrl(input);

    expect(Date.now() - started).toBeLessThan(20);
    expect(parsed).toEqual({ kind: 'invalid', reason: 'too_long' });
  });

  test('input over 2048 characters is too long, even with a link inside', () => {
    expect(parseMapsUrl(`https://www.google.com/maps?q=10.7769,106.7009 ${'x'.repeat(2048)}`)).toEqual({
      kind: 'invalid',
      reason: 'too_long',
    });
  });

  test('a link of exactly 2048 characters still parses', () => {
    const head = 'https://www.google.com/maps?q=10.7769,106.7009&pad=';
    expect(parseMapsUrl(head + 'p'.repeat(2048 - head.length))).toMatchObject({ kind: 'point', source: 'query' });
  });

  test('a run of trailing punctuation is stripped from a link inside a message', () => {
    expect(parseMapsUrl(`Xem https://maps.app.goo.gl/DemoAbc${'.)!?'.repeat(400)}`)).toEqual({
      kind: 'short_link',
      url: 'https://maps.app.goo.gl/DemoAbc',
    });
  });

  test('maps.app.goo.gl with no id is not a short link', () => {
    expect(parseMapsUrl('https://maps.app.goo.gl/')).toEqual({ kind: 'invalid', reason: 'not_maps' });
  });
});

describe('toLatLng', () => {
  test.each([
    [90, 180, true],
    [-90, -180, true],
    [90.0001, 0, false],
    [0, -180.0001, false],
    [Number.NaN, 0, false],
    [0, Number.POSITIVE_INFINITY, false],
  ])('lat %d lng %d accepted: %s', (lat, lng, ok) => {
    expect(toLatLng(lat, lng).ok).toBe(ok);
  });
});

describe('isInVietnam', () => {
  const at = (lat: number, lng: number) => {
    const point = toLatLng(lat, lng);
    if (!point.ok) throw new Error('fixture point out of range');
    return isInVietnam(point.value);
  };

  test('the box edges count as inside', () => {
    expect([at(8, 102), at(24, 110), at(16, 106)]).toEqual([true, true, true]);
  });

  test('just past each edge is outside', () => {
    expect([at(7.99, 106), at(24.01, 106), at(16, 101.99), at(16, 110.01)]).toEqual([false, false, false, false]);
  });
});
