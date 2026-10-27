import type { IsoDate } from '@esta/core';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';

export type NoteCitation = { readonly url: string; readonly sourceName: string; readonly publishedOn: IsoDate | null };

const citation = z.object({ url: z.url({ protocol: /^https$/ }), source_name: z.string(), published_at: isoDateSchema.nullable().catch(null) });

/** The source chips of a stored `agent_items.citations`: each entry on its own, so one bad entry hides only itself. */
export function noteCitations(raw: unknown): NoteCitation[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const parsed = citation.safeParse(entry);
    return parsed.success ? [{ url: parsed.data.url, sourceName: parsed.data.source_name, publishedOn: parsed.data.published_at }] : [];
  });
}
