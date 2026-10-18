import { AGENT_SCHEMAS, reduceNationalIds, type AgentSchemaName } from '@esta/core/agent-schemas';
import { flattenLeaves } from '@esta/core/extraction';
import type { Json } from '@esta/db';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import { ToolRejection } from './server';

/** The first answer and two repair turns (AGENT.md §5.1 step 4). */
export const MAX_SAVE_ATTEMPTS = 3;

type Locale = 'vi' | 'en';

export const ITEM_TITLES = {
  review: { vi: (title: string) => `Đã đọc xong ${title}. Mời bạn kiểm tra lại.`, en: (title: string) => `Finished reading ${title}. Please check it.` },
  failed: {
    vi: (title: string) => `Trợ lý không đọc được ${title}. Bạn có thể thử lại hoặc nhập tay.`,
    en: (title: string) => `The assistant could not read ${title}. You can try again or enter it by hand.`,
  },
} as const satisfies Record<string, Record<Locale, (title: string) => string>>;

export const localeOf = (locale: string): Locale => (locale === 'en' ? 'en' : 'vi');

export type Validated = { readonly ok: true; readonly result: Record<string, unknown>; readonly fieldConfidence: Record<string, number> } | { readonly ok: false; readonly errors: string };

/** Reduces ID numbers first, so a full number in `id_last4` passes as its last four digits instead of costing a repair turn. */
export function validateExtraction(schemaName: AgentSchemaName, raw: unknown): Validated {
  const parsed = AGENT_SCHEMAS[schemaName].schema.safeParse(reduceNationalIds(raw));
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    return { ok: false, errors };
  }
  const result = reduceNationalIds(parsed.data) as Record<string, unknown>;
  const fieldConfidence = Object.fromEntries(flattenLeaves(result).map((entry) => [entry.path, entry.leaf.confidence]));
  return { ok: true, result, fieldConfidence };
}

export type ExtractionBinding = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly extractionId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly schemaName: AgentSchemaName;
  readonly locale: Locale;
};

const input = z.object({ result: z.unknown() });

async function check(step: string, request: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await request;
  if (error) throw new Error(`${step} failed: ${error.message}`);
}

/**
 * Counts the model's answers and tells it what to fix, at most `MAX_SAVE_ATTEMPTS` times. `persist` runs only for a
 * valid result; the recorder passes one that writes nothing, so a live recording sees the worker's exact replies.
 */
export function extractionSaver(
  schemaName: AgentSchemaName,
  persist: (validated: Extract<Validated, { ok: true }>) => Promise<void>,
): (raw: Record<string, unknown>) => Promise<{ saved: true }> {
  let rejected = 0;
  return async (raw) => {
    if (rejected >= MAX_SAVE_ATTEMPTS) throw new ToolRejection('No attempts are left. Stop and reply that the document could not be read.');
    const validated = validateExtraction(schemaName, input.parse(raw).result);
    if (!validated.ok) {
      rejected += 1;
      const next = rejected >= MAX_SAVE_ATTEMPTS ? 'No attempts are left.' : 'Fix these fields and call save_extraction again.';
      throw new ToolRejection(`The result does not match ${schemaName}:\n${validated.errors}\n${next}`);
    }
    await persist(validated);
    return { saved: true };
  };
}

/**
 * The model's only write. Bound to one extraction of the job's household, it validates, keeps only the last four digits
 * of ID numbers, fills the row for review and leaves one item for the household. A re-run after a crash rewrites the
 * same row and meets the same dedupe key, so its effects exist once (AGT-1).
 */
export function saveExtraction(binding: ExtractionBinding): (raw: Record<string, unknown>) => Promise<{ saved: true }> {
  const { db, householdId, extractionId } = binding;
  return extractionSaver(binding.schemaName, async (validated) => {
    const { data, error } = await db
      .from('document_extractions')
      .update({ status: 'needs_review', result: validated.result as Json, field_confidence: validated.fieldConfidence, job_id: binding.jobId })
      .eq('id', extractionId)
      .eq('household_id', householdId)
      .eq('document_id', binding.documentId)
      .in('status', ['running', 'needs_review'])
      .select('id');
    if (error) throw new Error(`save_extraction failed: ${error.message}`);
    if (data.length !== 1) throw new Error(`save_extraction found no extraction ${extractionId} waiting in this household`);
    await check(
      'Writing the review item',
      db.from('agent_items').upsert(
        {
          household_id: householdId,
          kind: 'alert',
          severity: 'info',
          audience: 'all',
          title: ITEM_TITLES.review[binding.locale](binding.documentTitle),
          related: { document_id: binding.documentId, extraction_id: extractionId },
          dedupe_key: `extract_review:${extractionId}`,
          job_id: binding.jobId,
        },
        { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
      ),
    );
    console.log(`[agent] save_extraction ok ${extractionId}`);
  });
}
