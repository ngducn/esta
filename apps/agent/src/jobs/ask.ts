import type { Clock } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { Json, TablesUpdate } from '@esta/db';
import { z } from 'zod';
import { askPrompt, askRepairPrompt } from '../prompts/ask';
import type { AgentDb } from '../supabase';
import { askReads, type AskReads } from '../tools/ask-reads';
import { collectionsTool, portfolioOverviewTool } from '../tools/collections';
import { NumberGuardError, writeGuardItem } from '../tools/create-item';
import { proposalWriter } from '../tools/create-proposal';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { ledgerTool } from '../tools/ledger';
import { listLeasesTool, paymentBehaviorTool } from '../tools/leases';
import { listPropertiesTool } from '../tools/list-properties';
import { getPropertyTool, propertyMetricsTool } from '../tools/property-facts';
import { estaTool } from '../tools/server';
import { taxPositionTool } from '../tools/tax-position';
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
  readonly reads: AskReads;
  clock(): Promise<Clock>;
};

type AnswerUpdate = Pick<TablesUpdate<'messages'>, 'content_md' | 'status' | 'refs'>;

async function writeAnswer({ db, householdId, answerId }: Pick<AskInput, 'db' | 'householdId' | 'answerId'>, update: AnswerUpdate): Promise<void> {
  const { data, error } = await db.from('messages').update(update).eq('household_id', householdId).eq('id', answerId).eq('status', 'streaming').select('id');
  if (error) throw new Error(`Writing the answer failed: ${error.message}`);
  if (data.length !== 1) throw new Error(`The answer ${answerId} is no longer streaming`);
}

export function askRequest(input: AskInput): PreparedJob {
  const { db, householdId, locale, reads, asOf } = input;
  const { sheet, cite } = runSheet();
  const properties = listPropertiesTool(db, householdId, cite);
  const context = { reads, locale, asOf, cite, properties: properties.records };
  const stream = answerStream({ sheet, write: (content) => writeAnswer(input, { content_md: content }) });
  let repaired = false;
  let answer: Answer | null = null;
  return {
    prompt: askPrompt({ locale, today: input.asOf, timezone: input.timezone, question: input.question }),
    tools: new Map([
      estaTool('list_properties', properties.run),
      estaTool('portfolio_overview', portfolioOverviewTool(context)),
      estaTool('get_property', getPropertyTool(context)),
      estaTool('property_metrics', propertyMetricsTool(context)),
      estaTool('list_leases', listLeasesTool(context)),
      estaTool('collections', collectionsTool(context)),
      estaTool('ledger', ledgerTool(db, householdId, locale, properties.records, cite)),
      estaTool('tax_position', taxPositionTool(context)),
      estaTool('payment_behavior', paymentBehaviorTool(context)),
      estaTool('create_proposal', proposalWriter({ db, householdId, jobId: input.jobId, locale, sheet, clock: input.clock }).write),
    ]),
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

async function startTurn(db: AgentDb, job: AgentJob): Promise<{ readonly question: string; readonly answerId: string }> {
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
  const [turn, locale, now] = await Promise.all([startTurn(db, job), householdLocale(db, job.household_id), clock()]);
  const asOf = now.today();
  return askRequest({ db, householdId: job.household_id, jobId: job.id, answerId: turn.answerId, locale, asOf, timezone, question: turn.question, reads: askReads(db, job.household_id, { locale, asOf }), clock });
}

export async function failAsk({ db, job }: Pick<JobContext, 'db' | 'job'>): Promise<void> {
  const payload = payloadSchema.pick({ answer_id: true }).safeParse(job.payload);
  if (!payload.success) return;
  const { error } = await db.from('messages').update({ content_md: '', status: 'error' }).eq('household_id', job.household_id).eq('id', payload.data.answer_id).eq('status', 'streaming');
  if (error) throw new Error(`Marking the answer failed: ${error.message}`);
}
