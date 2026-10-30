import { z } from 'zod';

export type ThreadTopic = { readonly kind: 'item'; readonly itemId: string } | { readonly kind: 'property'; readonly propertyId: string };

export const threadTopicSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('item'), itemId: z.uuid() }),
  z.strictObject({ kind: z.literal('property'), propertyId: z.uuid() }),
]);

export const noteRelatedSchema = z.object({
  facts: z.array(z.object({ rule_id: z.string(), subject_key: z.string() })).catch([]).default([]),
  links: z.array(z.string()).catch([]).default([]),
});

export type NoteRelated = z.output<typeof noteRelatedSchema>;

export type RelatedFact = { readonly ruleId: string; readonly subjectKey: string; readonly link: string };

export const noteRelatedOf = (facts: readonly RelatedFact[]): NoteRelated => ({
  facts: facts.map(({ ruleId, subjectKey }) => ({ rule_id: ruleId, subject_key: subjectKey })),
  links: facts.map(({ link }) => link),
});

export const noteRelated = (raw: unknown): NoteRelated => noteRelatedSchema.safeParse(raw).data ?? { facts: [], links: [] };
