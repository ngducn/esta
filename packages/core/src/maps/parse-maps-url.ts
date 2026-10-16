import type { Result } from '../result';
import { isInVietnam } from './bounds';

declare const latLngBrand: unique symbol;

export type LatLng = { readonly lat: number; readonly lng: number; readonly [latLngBrand]: true };

export function toLatLng(lat: number, lng: number): Result<LatLng, 'out_of_range'> {
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { ok: false, reason: 'out_of_range' };
  return { ok: true, value: { lat, lng } as LatLng };
}

export type PointSource = 'place' | 'viewport' | 'query' | 'll';

export type MapsLinkInvalidReason = 'not_a_url' | 'not_maps' | 'no_coordinates' | 'out_of_range';

export type MapsLinkParse =
  | { readonly kind: 'point'; readonly point: LatLng; readonly source: PointSource; readonly outsideVietnam: boolean }
  | { readonly kind: 'short_link'; readonly url: string }
  | { readonly kind: 'invalid'; readonly reason: MapsLinkInvalidReason };

type PatternHit =
  | { readonly kind: 'short_link' }
  | { readonly kind: 'coordinates'; readonly source: PointSource; readonly lat: string; readonly lng: string };

interface MapsPattern {
  readonly row: string;
  readonly match: (url: URL) => PatternHit | undefined;
}

const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?`;
const PLACE = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`);
const VIEWPORT = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`);
const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`);

const LONG_HOSTS_UNDER_MAPS = new Set(['google.com', 'www.google.com', 'google.com.vn', 'www.google.com.vn']);
const LONG_HOSTS_ANY_PATH = new Set(['maps.google.com', 'maps.google.com.vn']);

function isWebUrl(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:';
}

export function isUnderMapsPath(pathname: string): boolean {
  return pathname === '/maps' || pathname.startsWith('/maps/');
}

/** `maps.app.goo.gl/<id>` or `goo.gl/maps/<id>`; the resolver adds the scheme, port and userinfo rules. */
export function isShortMapsLink(url: URL): boolean {
  if (!isWebUrl(url)) return false;
  if (url.hostname === 'maps.app.goo.gl') return url.pathname.length > 1;
  return url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/') && url.pathname.length > '/maps/'.length;
}

function isLongMapsLink(url: URL): boolean {
  if (!isWebUrl(url)) return false;
  return LONG_HOSTS_ANY_PATH.has(url.hostname) || (LONG_HOSTS_UNDER_MAPS.has(url.hostname) && isUnderMapsPath(url.pathname));
}

function coordinates(source: PointSource, match: RegExpExecArray | null): PatternHit | undefined {
  const [, lat, lng] = match ?? [];
  return lat === undefined || lng === undefined ? undefined : { kind: 'coordinates', source, lat, lng };
}

/** One entry per DOMAIN-VN §9 row, in table order, so place coordinates win over the viewport center. */
export const MAPS_PATTERNS: readonly MapsPattern[] = [
  { row: 'maps.app.goo.gl/<id>, goo.gl/maps/<id>', match: (url) => (isShortMapsLink(url) ? { kind: 'short_link' } : undefined) },
  { row: '!3d<lat>!4d<lng>', match: (url) => coordinates('place', PLACE.exec(url.pathname)) },
  { row: '@<lat>,<lng>', match: (url) => coordinates('viewport', VIEWPORT.exec(url.pathname)) },
  { row: '?q=<lat>,<lng>', match: (url) => coordinates('query', PAIR.exec(url.searchParams.get('q') ?? '')) },
  { row: '?ll=<lat>,<lng>', match: (url) => coordinates('ll', PAIR.exec(url.searchParams.get('ll') ?? '')) },
];

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

function findUrl(input: string): URL | undefined {
  const found = URL_IN_TEXT.exec(input)?.[0].replace(TRAILING_PUNCTUATION, '');
  if (found === undefined) return undefined;
  try {
    return new URL(found);
  } catch {
    return undefined;
  }
}

function invalid(reason: MapsLinkInvalidReason): MapsLinkParse {
  return { kind: 'invalid', reason };
}

/** Reads a pasted Google Maps link, or a share message that contains one, without any network call. */
export function parseMapsUrl(input: string): MapsLinkParse {
  const url = findUrl(input);
  if (url === undefined) return invalid('not_a_url');
  if (!isShortMapsLink(url) && !isLongMapsLink(url)) return invalid('not_maps');
  for (const pattern of MAPS_PATTERNS) {
    const hit = pattern.match(url);
    if (hit === undefined) continue;
    if (hit.kind === 'short_link') return { kind: 'short_link', url: url.href };
    const point = toLatLng(Number(hit.lat), Number(hit.lng));
    if (!point.ok) return invalid('out_of_range');
    return { kind: 'point', point: point.value, source: hit.source, outsideVietnam: !isInVietnam(point.value) };
  }
  return invalid('no_coordinates');
}
