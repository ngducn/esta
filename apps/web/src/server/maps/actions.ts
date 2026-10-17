'use server';

import { parseMapsUrl, type MapsLinkInvalidReason } from '@esta/core/maps';
import { z } from 'zod';
import { getSessionUser } from '@/server/member';
import { resolveShortMapsLink, type ResolveError } from './resolve-short-maps-link';

export type MapsLinkFailure = MapsLinkInvalidReason | ResolveError | 'signed_out';

export type MapsLinkResult =
  | { readonly ok: true; readonly lat: number; readonly lng: number; readonly outsideVietnam: boolean }
  | { readonly ok: false; readonly reason: MapsLinkFailure };

const input = z.string();

/** PRP-5: only a signed-in caller reaches the network, and only for a short link; a long link never leaves the parser. */
export async function resolveMapsLink(raw: unknown): Promise<MapsLinkResult> {
  if ((await getSessionUser()) === null) return { ok: false, reason: 'signed_out' };
  const parsedInput = input.safeParse(raw);
  if (!parsedInput.success) return { ok: false, reason: 'not_a_url' };
  const parsed = parseMapsUrl(parsedInput.data);
  const resolved = parsed.kind === 'short_link' ? await resolveShortMapsLink(parsed.url) : { ok: true as const, value: parsed };
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const link = resolved.value;
  if (link.kind === 'invalid') return { ok: false, reason: link.reason };
  return { ok: true, lat: link.point.lat, lng: link.point.lng, outsideVietnam: link.outsideVietnam };
}
