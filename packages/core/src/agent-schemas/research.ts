import { z } from 'zod';
import { isoDateSchema } from '../schemas/legal';
import { factHandleSchema } from './portfolio-watch';
import { oneLine } from './text';

export const RESEARCH_KINDS = ['infrastructure', 'land_price', 'legal_tax', 'market_rent', 'planning', 'other'] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];

/** `summary_vi` as it reads, after its placeholders fill (AGENT.md §5.2). */
export const MAX_SUMMARY_TOKENS = 60;

export const MAX_QUOTES = 3;

export const researchItemDraftSchema = z
  .object({
    source_url: z.string().trim().min(1).max(2000),
    source_name: oneLine(120),
    published_on: isoDateSchema,
    effective_on: isoDateSchema.nullable().default(null),
    kind: z.enum(RESEARCH_KINDS),
    relevance: z.number().min(0).max(1),
    title_vi: oneLine(200),
    summary_vi: oneLine(600),
    why_it_matters_vi: oneLine(300),
    topics: z.array(factHandleSchema).min(1).max(5),
    properties: z.array(factHandleSchema).max(20).default([]),
    quotes: z.array(oneLine(80)).max(MAX_QUOTES).default([]),
  })
  .strict();

export type ResearchItemDraft = z.infer<typeof researchItemDraftSchema>;
