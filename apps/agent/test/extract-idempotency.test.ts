import { describe, expect, it } from 'vitest';
import { attempt, DOCUMENT_A, EXTRACTION_A, extractJob, twoHouseholds } from './extract-job';

describe('extract_document re-run after a crash (AGT-1)', () => {
  it('leaves one extraction in needs_review and one item when the worker dies after save_extraction', async () => {
    const { db, tables } = twoHouseholds();
    const job = extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A });
    await attempt(db, job, { crash: true });
    expect(tables.document_extractions[0]).toMatchObject({ status: 'needs_review' });
    const { result } = await attempt(db, job);
    expect(result).toEqual({ extraction_id: EXTRACTION_A });
    expect(tables.document_extractions.filter((row) => row.document_id === DOCUMENT_A)).toEqual([expect.objectContaining({ status: 'needs_review' })]);
    expect(tables.agent_items).toHaveLength(1);
  });
});
