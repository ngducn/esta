import { existingLinks } from '@esta/ops';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readRecording, DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { pollOnce } from '../../src/runner';
import { fakeDb } from '../../src/test/fake-db';
import { answerRow, askTables, askWorker } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';
import { JOBS } from '../../src/jobs/registry';
import { askPrompt } from '../../src/prompts/ask';
import { canonicalizer } from '../../src/replay/canonicalize';
import { canonicalInput } from '../../src/sdk/session';
import { askRecording, ASK_CASES, ASK_CONTEXT } from './ask-cases';

const truth = JSON.parse(readFileSync(join(import.meta.dirname, 'ask-ground-truth.json'), 'utf8')) as Array<{ question: string; figure: string; value: number }>;
const figure = (question: string) => vnd(truth.find((row) => row.question === question)?.value ?? Number.NaN);
const DI_AN = '93cc970b-f9c2-52f5-bc34-1f1edb76742c';

const jobsDir = mkdtempSync(join(tmpdir(), 'esta-ask-golden-'));
afterAll(() => rmSync(jobsDir, { recursive: true, force: true }));

async function ask(id: string) {
  const askCase = ASK_CASES.find((candidate) => candidate.id === id);
  if (askCase === undefined) throw new Error(`no case ${id}`);
  const tables = askTables(askCase.question);
  const { worker } = askWorker(tables, jobsDir);
  await pollOnce(worker);
  return { tables, answer: answerRow(tables), job: tables.agent_jobs?.[0] as { status: string; result: { cited: Array<{ placeholder: string; value: string }> } } };
}

const links = (markdown: string) => [...markdown.matchAll(/\]\((esta:\/\/[^)]+)\)/g)].map(([, link]) => link ?? '');

describe('ask in replay on the full seed at 2026-10-07 07:00 (AGENT.md §7.4, AGT-7)', () => {
  it.each(ASK_CASES)('$id has its committed hand-written recording', (askCase) => {
    const { input, ...recording } = askRecording(askCase);
    expect(readRecording(DEFAULT_REPLAY_DIR, canonicalInput({ spec: JOBS.ask, prompt: askPrompt({ ...ASK_CONTEXT, question: askCase.question }), canon: canonicalizer({ householdName: 'Gia đình Demo' }) }))).toEqual({ input, ...recording });
  });

  it('question 1 answers the October income of Dĩ An equal to the ground truth, linked to its ledger', async () => {
    const { tables, answer, job } = await ask('q1-di-an-income');
    expect(job.status).toBe('done');
    expect(answer.status).toBe('done');
    expect(answer.content_md).toBe(
      `Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu ${formatVnd(figure('q1'), 'vi')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/${DI_AN}).`,
    );
    expect(job.result.cited.filter(({ placeholder }) => placeholder.endsWith('income_display}}')).map(({ value }) => value)).toEqual([formatVnd(figure('q1'), 'vi')]);
    expect(answer.refs).toEqual([`esta://ledger/${DI_AN}`]);
    const present = await existingLinks(fakeDb(tables), HOUSEHOLD, links(answer.content_md));
    expect(links(answer.content_md).filter((link) => !present.has(link))).toEqual([]);
  });

  it('a question the tools cannot answer says the app has no such data and cites no figure', async () => {
    const { answer, job } = await ask('missing-market-price');
    expect(answer.status).toBe('done');
    expect(answer.content_md).toContain('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc');
    expect(job.result.cited.map(({ placeholder }) => placeholder)).toEqual(['{{f1.property_label}}']);
    expect(answer.content_md).not.toMatch(/\p{N}/u);
  });
});
