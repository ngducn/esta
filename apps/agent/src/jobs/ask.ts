import type { Clock } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { Json, TablesUpdate } from '@esta/db';
import { z } from 'zod';
import { askPrompt, askRepairPrompt } from '../prompts/ask';
import type { AgentDb } from '../supabase';
import { NumberGuardError, writeGuardItem } from '../tools/create-item';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { ledgerTool } from '../tools/ledger';
import { listPropertiesTool } from '../tools/list-properties';
import { estaTool } from '../tools/server';
import { answerStream, type Answer } from './askStream';
import { InvalidJobError } from './extract-document';
import type { AgentJob, JobContext, PreparedJob } from './registry';

const payloadSchema = z.object({ conversation_id: z.uuid(), question_id: z.uuid(), answer_id: z.uuid() });

export type AskInput = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly answerId: string;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly timezone: string;
  readonly question: string;
  clock(): Promise<Clock>;
};

type AnswerUpdate = Pick<TablesUpdate<'messages'>, 'content_md' | 'status' | 'refs'>;

/** Writes the answer row only while it streams, so a finished or failed answer never changes again. */
async function writeAnswer({ db, householdId, answerId }: Pick<AskInput, 'db' | 'householdId' | 'answerId'>, update: AnswerUpdate): Promise<void> {
  const { data, error } = await db.from('messages').update(update).eq('household_id', householdId).eq('id', answerId).eq('status', 'streaming').select('id');
  if (error) throw new Error(`Writing the answer failed: ${error.message}`);
  if (data.length !== 1) throw new Error(`The answer ${answerId} is no longer streaming`);
}

/**
 * The ask request (AGENT.md §5.6): the read tools fill the run's sheet, and the answer streams into its row through
 * the sentence guard. A violation gets one repair turn in the same session, which starts the answer over; a second
 * fails the job with the operator note. The worker and the golden test build it here, so a recording hashes the
 * prompt the worker ships.
 */
export function askRequest(input: AskInput): PreparedJob {
  const { db, householdId, locale } = input;
  const { sheet, cite } = runSheet();
  const properties = listPropertiesTool(db, householdId, cite);
  const stream = answerStream({ sheet, write: (content) => writeAnswer(input, { content_md: content }) });
  let repaired = false;
  let answer: Answer | null = null;
  return {
    prompt: askPrompt({ locale, today: input.asOf, timezone: input.timezone, question: input.question }),
    tools: new Map([estaTool('list_properties', properties.run), estaTool('ledger', ledgerTool(db, householdId, locale, properties.records, cite))]),
    onText: stream.push,
    async nextTurn() {
      const ended = await stream.end();
      if (ended.ok) {
        answer = ended.value;
        return null;
      }
      if (!repaired) {
        repaired = true;
        stream.restart();
        return askRepairPrompt(ended.reason);
      }
      await writeGuardItem({ db, householdId, jobId: input.jobId, locale, sheet, clock: input.clock }, stream.template(), ended.reason);
      throw new NumberGuardError('number_guard: the answer still held text the number guard rejects after its repair turn; the operator note has it');
    },
    async finish(): Promise<Json> {
      if (answer === null || answer.text === '') throw new Error('The model ended without an answer');
      await writeAnswer(input, { content_md: answer.text, status: 'done', refs: [...answer.refs] });
      return { template: answer.template, cited: answer.cited.map(({ placeholder, value }) => ({ placeholder, value })), refs: [...answer.refs] };
    },
  };
}

type Turn = { readonly question: string; readonly answerId: string };

/** The question and its answer row, which must be the conversation's; a retry starts the answer over. */
async function readTurn(db: AgentDb, job: AgentJob): Promise<Turn> {
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success) throw new InvalidJobError(`ask ${job.id} has no conversation, question and answer`);
  const { conversation_id, question_id, answer_id } = payload.data;
  const { data, error } = await db.from('messages').select('id, role, content_md').eq('household_id', job.household_id).eq('conversation_id', conversation_id).in('id', [question_id, answer_id]);
  if (error) throw new Error(`Reading the question failed: ${error.message}`);
  const question = data.find((row) => row.id === question_id && row.role === 'user');
  if (question === undefined || !data.some((row) => row.id === answer_id && row.role === 'assistant')) throw new InvalidJobError(`ask ${job.id}: the question or its answer is not in conversation ${conversation_id}`);
  await writeAnswer({ db, householdId: job.household_id, answerId: answer_id }, { content_md: '' });
  return { question: question.content_md, answerId: answer_id };
}

export async function prepareAsk({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const [turn, locale, now] = await Promise.all([readTurn(db, job), householdLocale(db, job.household_id), clock()]);
  return askRequest({ db, householdId: job.household_id, jobId: job.id, answerId: turn.answerId, locale, asOf: now.today(), timezone, question: turn.question, clock });
}

/** The answer shows Mẹ a plain failure line instead of a half answer; the operator item and the job hold the cause (AGENT.md §9). */
export async function failAsk({ db, job }: Pick<JobContext, 'db' | 'job'>): Promise<void> {
  const payload = payloadSchema.pick({ answer_id: true }).safeParse(job.payload);
  if (!payload.success) return;
  const { error } = await db.from('messages').update({ content_md: '', status: 'error' }).eq('household_id', job.household_id).eq('id', payload.data.answer_id).eq('status', 'streaming');
  if (error) throw new Error(`Marking the answer failed: ${error.message}`);
}
