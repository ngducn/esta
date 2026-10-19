import type { AgentSchemaName } from '@esta/core/agent-schemas';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalizer } from '../replay/canonicalize';
import type { SessionRequest } from '../sdk/session';
import { extractRequest } from './extract-document';
import { JOBS } from './registry';

type ExtractSession = { readonly request: SessionRequest; saved(): Record<string, unknown> | null };

/**
 * The worker's extract_document request for one file outside a job, for the recorder, the golden test and the accuracy
 * eval. save_extraction validates as it does in the worker and keeps the valid answer in memory instead of writing it.
 * The job and config directories are deleted after `use`.
 */
export async function withExtractSession<T>(
  schemaName: AgentSchemaName,
  file: { readonly buffer: Uint8Array; readonly mimeType: string },
  use: (session: ExtractSession) => Promise<T>,
): Promise<T> {
  const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-extract-job-')));
  const configDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-extract-config-')));
  try {
    let saved: Record<string, unknown> | null = null;
    const persist = async ({ result }: { readonly result: Record<string, unknown> }) => {
      saved = result;
    };
    const request: SessionRequest = {
      spec: JOBS.extract_document,
      ...extractRequest({ schemaName, bytes: file.buffer, mime: file.mimeType, jobDir, persist }),
      jobDir,
      configDir,
      canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }),
    };
    return await use({ request, saved: () => saved });
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}
