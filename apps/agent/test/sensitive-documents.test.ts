import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareExtractDocument } from '../src/jobs/extract-document';
import { JOBS } from '../src/jobs/registry';
import { decideToolUse } from '../src/sdk/path-policy';
import { mcpToolName } from '../src/tools/server';
import { attempt, B, clock, DOCUMENT_A, DOCUMENT_B, EXTRACTION_A, EXTRACTION_B, extractJob, newJobDir, twoHouseholds } from './extract-job';

describe('sensitive documents reach the agent only through their own extraction job (DOC-5)', () => {
  it('puts only the target file in the job directory', async () => {
    const jobDir = newJobDir();
    try {
      await prepareExtractDocument({ db: twoHouseholds().db, job: extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), jobDir, timezone: 'Asia/Ho_Chi_Minh', waiting: [], clock });
      expect(readdirSync(jobDir)).toEqual(['document.pdf']);
    } finally {
      rmSync(jobDir, { recursive: true, force: true });
    }
  });

  it("denies Read of another job's file, of /etc/hosts and of a padded home path", () => {
    const jobDir = newJobDir();
    const other = newJobDir();
    try {
      writeFileSync(join(other, 'document.pdf'), 'x');
      mkdirSync(join(jobDir, 'pages'));
      const policy = { allowed: new Set([...JOBS.extract_document.builtInTools, mcpToolName('save_extraction')]), jobDir };
      for (const file_path of [join(other, 'document.pdf'), '/etc/hosts', ' ~/.ssh/id_rsa']) {
        expect(decideToolUse(policy, 'Read', { file_path }).allow, file_path).toBe(false);
      }
    } finally {
      rmSync(jobDir, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('gives Read, or any tool that returns file bytes, to extract_document only', () => {
    for (const spec of Object.values(JOBS)) {
      if (spec.kind === 'extract_document') continue;
      expect(spec.builtInTools, spec.kind).toEqual([]);
      expect(spec.mcpTools, spec.kind).not.toContain('save_extraction');
    }
  });

  it('refuses through save_extraction a document of another household', async () => {
    const { db, tables } = twoHouseholds();
    await expect(attempt(db, extractJob({ document_id: DOCUMENT_B, extraction_id: EXTRACTION_B }))).rejects.toThrow('is not in the household');
    expect(tables.document_extractions.find((row) => row.household_id === B)).toMatchObject({ status: 'queued' });
  });
});
