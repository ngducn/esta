import { z } from 'zod';

/** What her message is about (AGENT.md §5.6 step 1): a note Trợ lý left, or one of the household's properties. */
export type ThreadTopic = { readonly kind: 'item'; readonly itemId: string } | { readonly kind: 'property'; readonly propertyId: string };

export const threadTopicSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('item'), itemId: z.uuid() }),
  z.strictObject({ kind: z.literal('property'), propertyId: z.uuid() }),
]);

/** A note's `related` as every job writes it: the watch facts it tells, and the `esta://` links of the records it names. */
export const noteRelatedSchema = z.object({
  facts: z.array(z.object({ rule_id: z.string(), subject_key: z.string() })).catch([]).default([]),
  links: z.array(z.string()).catch([]).default([]),
});

export type NoteRelated = z.output<typeof noteRelatedSchema>;

export const noteRelated = (raw: unknown): NoteRelated => noteRelatedSchema.safeParse(raw).data ?? { facts: [], links: [] };
