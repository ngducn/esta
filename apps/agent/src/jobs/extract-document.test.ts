import { describe, expect, it } from 'vitest';
import type { Recorded } from '../test/fake-db';
import { A, attempt, clock, DOCUMENT_A, DOCUMENT_B, EXTRACTION_A, EXTRACTION_B, extractJob, NOW, twoHouseholds } from '../../test/extract-job';
import { failExtractDocument, InvalidJobError } from './extract-document';

describe('extract_document on the fake service client', () => {
  it('reads the certificate, saves it for review and leaves one item titled in the household locale', async () => {
    const { db, tables } = twoHouseholds();
    const { result } = await attempt(db, extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }));
    expect(result).toEqual({ extraction_id: EXTRACTION_A });
    expect(tables.document_extractions[0]).toMatchObject({ status: 'needs_review', model: 'claude-sonnet-5-5' });
    expect(tables.agent_items).toEqual([
      expect.objectContaining({
        household_id: A,
        kind: 'alert',
        severity: 'info',
        audience: 'all',
        title: 'Đã đọc xong Sổ hồng Bảo Lộc. Mời bạn kiểm tra lại.',
        dedupe_key: `extract_review:${EXTRACTION_A}`,
        created_at: NOW,
      }),
    ]);
  });

  it('fails a household A job whose payload names a household B document, and writes nothing (FND-2)', async () => {
    const writes: Recorded[] = [];
    const { db, tables } = twoHouseholds(writes);
    await expect(attempt(db, extractJob({ document_id: DOCUMENT_B, extraction_id: EXTRACTION_B }))).rejects.toThrow(InvalidJobError);
    await expect(attempt(db, extractJob({ document_id: DOCUMENT_B, extraction_id: EXTRACTION_B }))).rejects.toThrow('is not in the household');
    expect(writes).toEqual([]);
    expect(tables.document_extractions[1]).toMatchObject({ status: 'queued' });
    expect(tables.agent_items).toEqual([]);
  });

  it('refuses an extraction of another document or another job', async () => {
    const { db } = twoHouseholds();
    await expect(attempt(db, extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_B }))).rejects.toThrow(InvalidJobError);
  });

  it('marks the extraction failed after the last attempt and offers admins a retry, once', async () => {
    const { db, tables } = twoHouseholds();
    const job = extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A });
    await failExtractDocument({ db, job, clock });
    await failExtractDocument({ db, job, clock });
    expect(tables.document_extractions[0]).toMatchObject({ status: 'failed' });
    expect(tables.agent_items).toEqual([
      expect.objectContaining({
        severity: 'info',
        title: 'Trợ lý không đọc được Sổ hồng Bảo Lộc.',
        proposal: { type: 'retry_job', params: { job_id: job.id }, min_role: 'admin' },
        dedupe_key: `extract_failed:${EXTRACTION_A}`,
        created_at: NOW,
      }),
    ]);
  });

  it('cuts a full ID typed into the document title to its last four in every item it writes (D11)', async () => {
    const job = extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A });
    const read = twoHouseholds([], 'Sổ hồng CCCD mẹ 079062118340');
    await attempt(read.db, job);
    const failed = twoHouseholds([], 'Sổ hồng CCCD mẹ 079062118340');
    await failExtractDocument({ db: failed.db, job, clock });
    expect([...read.tables.agent_items, ...failed.tables.agent_items].map((item) => item.title)).toEqual([
      'Đã đọc xong Sổ hồng CCCD mẹ 8340. Mời bạn kiểm tra lại.',
      'Trợ lý không đọc được Sổ hồng CCCD mẹ 8340.',
    ]);
  });
});
