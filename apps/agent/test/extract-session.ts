import { AGENT_SCHEMAS } from '@esta/core/agent-schemas';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UploadFile } from '../../../fixtures/certificates/generator/uploads.tsx';
import { stageDocument } from '../src/jobs/extract-document';
import { JOBS } from '../src/jobs/registry';
import { extractDocumentPrompt } from '../src/prompts/extract-document';
import { canonicalizer } from '../src/replay/canonicalize';
import type { SessionRequest } from '../src/sdk/session';
import { extractionSaver } from '../src/tools/save-extraction';
import { estaTool } from '../src/tools/server';

export const newJobDir = (): string => realpathSync(mkdtempSync(join(tmpdir(), 'esta-extract-test-')));

/** The worker's request for one upload, with save_extraction validating for real and handing back what it would write. */
export function extractSession(
  schemaName: 'certificate_v1' | 'utility_bill_v1',
  upload: UploadFile,
  jobDir: string,
): { request: SessionRequest; saved: () => Record<string, unknown> | null } {
  let saved: Record<string, unknown> | null = null;
  const { filePath, sha256 } = stageDocument(jobDir, upload.buffer, upload.mimeType);
  const request: SessionRequest = {
    spec: JOBS.extract_document,
    prompt: extractDocumentPrompt({ schemaName, schemaVersion: AGENT_SCHEMAS[schemaName].version, filePath, sha256 }),
    jobDir,
    configDir: jobDir,
    tools: new Map([
      estaTool(
        'save_extraction',
        extractionSaver(schemaName, async (validated) => {
          saved = validated.result;
        }),
      ),
    ]),
    canon: canonicalizer({ householdName: 'Gia đình Demo 3', jobDir }),
  };
  return { request, saved: () => saved };
}
