import { AGENT_SCHEMAS, isAgentSchemaName } from '@esta/core/agent-schemas';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { extractDocumentPrompt } from '../prompts/extract-document';
import { ITEM_TITLES, localeOf, saveExtraction } from '../tools/save-extraction';
import { estaTool } from '../tools/server';
import type { AgentDb } from '../supabase';
import type { AgentJob, JobContext, PreparedJob } from './registry';

/** A job whose rows do not line up can never succeed, so the runner fails it without a retry. */
export class InvalidJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJobError';
  }
}

const payloadSchema = z.object({ document_id: z.uuid(), extraction_id: z.uuid() });

const EXTENSIONS: Readonly<Record<string, string>> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Writes the file as `document.<ext>` whatever its upload name, so the prompt, and so the replay hash, depends only on
 * the bytes and the type. The recorder and the tests stage files the same way.
 */
export function stageDocument(jobDir: string, bytes: Uint8Array, mime: string): { readonly filePath: string; readonly sha256: string } {
  const extension = EXTENSIONS[mime];
  if (extension === undefined) throw new InvalidJobError(`The type ${mime} cannot be read`);
  const filePath = join(jobDir, `document.${extension}`);
  writeFileSync(filePath, bytes);
  return { filePath, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function payloadOf(job: AgentJob) {
  const parsed = payloadSchema.safeParse(job.payload);
  if (!parsed.success) throw new InvalidJobError(`extract_document ${job.id} has no document_id and extraction_id in its payload`);
  return parsed.data;
}

async function householdLocale(db: AgentDb, householdId: string) {
  const { data, error } = await db.from('households').select('locale').eq('id', householdId).single();
  if (error) throw new Error(`Reading the household failed: ${error.message}`);
  return localeOf(data.locale);
}

/** Every read is filtered by the job's household, so a payload naming another household's document finds nothing (FND-2). */
async function loadRows(db: AgentDb, job: AgentJob) {
  const payload = payloadOf(job);
  const [document, extraction] = await Promise.all([
    db.from('documents').select('id, title, storage_path, mime').eq('id', payload.document_id).eq('household_id', job.household_id).maybeSingle(),
    db
      .from('document_extractions')
      .select('id, document_id, schema_name, job_id')
      .eq('id', payload.extraction_id)
      .eq('household_id', job.household_id)
      .maybeSingle(),
  ]);
  if (document.error) throw new Error(`Reading the document failed: ${document.error.message}`);
  if (extraction.error) throw new Error(`Reading the extraction failed: ${extraction.error.message}`);
  if (document.data === null) throw new InvalidJobError(`Document ${payload.document_id} is not in the household of job ${job.id}`);
  const row = extraction.data;
  if (row === null || row.document_id !== document.data.id || row.job_id !== job.id) {
    throw new InvalidJobError(`Extraction ${payload.extraction_id} does not belong to document ${payload.document_id} and job ${job.id}`);
  }
  if (!isAgentSchemaName(row.schema_name)) throw new InvalidJobError(`Extraction ${row.id} names the unknown schema ${row.schema_name}`);
  return { document: document.data, extraction: { ...row, schema_name: row.schema_name } };
}

/**
 * Downloads only the job's file into the job directory, marks the extraction running and binds save_extraction to it.
 * The model sees one file and one write tool (DOC-5).
 */
export async function prepareExtractDocument({ db, job, jobDir }: JobContext): Promise<PreparedJob> {
  const { document, extraction } = await loadRows(db, job);
  const download = await db.storage.from('documents').download(document.storage_path);
  if (download.error) throw new Error(`Downloading the document failed: ${download.error.message}`);
  const { filePath, sha256 } = stageDocument(jobDir, new Uint8Array(await download.data.arrayBuffer()), document.mime);

  const running = await db.from('document_extractions').update({ status: 'running' }).eq('id', extraction.id).eq('household_id', job.household_id).eq('status', 'queued');
  if (running.error) throw new Error(`Starting the extraction failed: ${running.error.message}`);

  const schemaName = extraction.schema_name;
  const save = saveExtraction({
    db,
    householdId: job.household_id,
    jobId: job.id,
    extractionId: extraction.id,
    documentId: document.id,
    documentTitle: document.title,
    schemaName,
    locale: await householdLocale(db, job.household_id),
  });
  return {
    prompt: extractDocumentPrompt({ schemaName, schemaVersion: AGENT_SCHEMAS[schemaName].version, filePath, sha256 }),
    tools: new Map([estaTool('save_extraction', save)]),
    async finish({ model }) {
      const { data, error } = await db
        .from('document_extractions')
        .update({ model })
        .eq('id', extraction.id)
        .eq('household_id', job.household_id)
        .eq('status', 'needs_review')
        .select('id');
      if (error) throw new Error(`Recording the model failed: ${error.message}`);
      if (data.length !== 1) throw new Error('The model ended without saving a valid extraction');
      return { extraction_id: extraction.id };
    },
  };
}

/** After the last attempt: the extraction reads failed and admins get one item with a Retry action (AGENT.md §9). */
export async function failExtractDocument({ db, job }: Omit<JobContext, 'jobDir'>): Promise<void> {
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success) return;
  const { data: failed, error } = await db
    .from('document_extractions')
    .update({ status: 'failed' })
    .eq('id', payload.data.extraction_id)
    .eq('household_id', job.household_id)
    .eq('document_id', payload.data.document_id)
    .eq('job_id', job.id)
    .in('status', ['queued', 'running'])
    .select('id');
  if (error) throw new Error(`Failing the extraction failed: ${error.message}`);
  if (failed.length !== 1) return;
  const { data: document, error: documentError } = await db
    .from('documents')
    .select('title')
    .eq('id', payload.data.document_id)
    .eq('household_id', job.household_id)
    .single();
  if (documentError) throw new Error(`Reading the document failed: ${documentError.message}`);
  const locale = await householdLocale(db, job.household_id);
  const item = await db.from('agent_items').upsert(
    {
      household_id: job.household_id,
      kind: 'alert',
      severity: 'info',
      audience: 'all',
      title: ITEM_TITLES.failed[locale](document.title),
      related: { document_id: payload.data.document_id, extraction_id: payload.data.extraction_id },
      proposal: { type: 'retry_job', params: { job_id: job.id }, min_role: 'admin' },
      dedupe_key: `extract_failed:${payload.data.extraction_id}`,
      job_id: job.id,
    },
    { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
  );
  if (item.error) throw new Error(`Writing the failure item failed: ${item.error.message}`);
}
