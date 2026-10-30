import type { Clock } from '@esta/core';
import { noteRelated } from '@esta/core/assistant';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { Json, TablesUpdate } from '@esta/db';
import { z } from 'zod';
import { askFollowUpPrompt, askPrompt, askRepairPrompt, type AskedTurn } from '../prompts/ask';
import type { AgentDb } from '../supabase';
import { askReads, type AskReads } from '../tools/ask-reads';
import { NumberGuardError, writeGuardItem } from '../tools/create-item';
import { proposalWriter } from '../tools/create-proposal';
import { runSheet } from '../tools/fact-sheet';
import { householdLocale } from '../tools/household-info';
import { readTools } from '../tools/read-tools';
import { estaTool } from '../tools/server';
import { loadTopic, type AskTopic } from '../tools/topic-reads';
import { answerStream, type Answer } from './askStream';
import { InvalidJobError } from './extract-document';
import type { AgentJob, JobContext, PreparedJob } from './registry';

const payloadSchema = z.object({ conversation_id: z.uuid(), question_id: z.uuid(), answer_id: z.uuid(), deep: z.boolean().default(false) });

/** The last turn of the conversation that finished, which a follow-up resumes; `handles` counts the handles it handed out. */
export type EarlierTurn = { readonly sessionId: string | null; readonly turnHash: string; readonly handles: number };

export type AskInput = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly conversationId: string;
  readonly questionId: string;
  readonly answerId: string;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly timezone: string;
  readonly question: string;
  readonly reads: AskReads;
  readonly earlier: EarlierTurn | null;
  /** The previous segment's last answered turns, which a turn with no session to resume starts from. */
  readonly seed: readonly AskedTurn[];
  readonly deep: boolean;
  readonly topic: AskTopic | null;
  clock(): Promise<Clock>;
};

type AnswerUpdate = Pick<TablesUpdate<'messages'>, 'content_md' | 'refs' | 'deferred_until'>;

async function writeAnswer({ db, householdId, answerId }: Pick<AskInput, 'db' | 'householdId' | 'answerId'>, update: AnswerUpdate): Promise<void> {
  const { data, error } = await db.from('messages').update(update).eq('household_id', householdId).eq('id', answerId).eq('status', 'streaming').select('id');
  if (error) throw new Error(`Writing the answer failed: ${error.message}`);
  if (data.length !== 1) throw new Error(`The answer ${answerId} is no longer streaming`);
}

/** Her questions in the conversation with the answers she read, oldest first, up to `before` when it names one. */
async function answeredTurns(db: AgentDb, householdId: string, conversationId: string, before?: string): Promise<AskedTurn[]> {
  const { data, error } = await db.from('messages').select('id, role, content_md, status').eq('household_id', householdId).eq('conversation_id', conversationId).order('created_at');
  if (error) throw new Error(`Reading the conversation so far failed: ${error.message}`);
  const end = before === undefined ? data.length : data.findIndex((row) => row.id === before);
  const rows = data.slice(0, Math.max(0, end));
  return rows.flatMap((row, index) => {
    const next = rows[index + 1];
    return row.role === 'user' && next?.role === 'assistant' && next.status === 'done' && next.content_md !== '' ? [{ question: row.content_md, answer: next.content_md }] : [];
  });
}

/** A new segment of her thread starts with the last turns of her previous one, so a follow-up just after midnight still knows what it follows. */
const SEED_TURNS = 3;

async function previousSegmentTurns(db: AgentDb, householdId: string, conversationId: string, creator: string | null): Promise<AskedTurn[]> {
  if (creator === null) return [];
  const { data, error } = await db.from('conversations').select('id').eq('household_id', householdId).eq('created_by', creator).neq('id', conversationId).order('last_asked_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Reading the previous conversation failed: ${error.message}`);
  const previous = data[0];
  return previous === undefined ? [] : (await answeredTurns(db, householdId, previous.id)).slice(-SEED_TURNS);
}

async function rebuildOrForgetSession(input: AskInput, earlier: EarlierTurn): Promise<string | null> {
  const turns = await answeredTurns(input.db, input.householdId, input.conversationId, input.questionId);
  if (turns.length > 0) return askPrompt({ locale: input.locale, today: input.asOf, timezone: input.timezone, question: input.question, earlier: turns });
  const { error } = await input.db.from('conversations').update({ sdk_session_id: null, sdk_turn_hash: null }).eq('household_id', input.householdId).eq('id', input.conversationId).eq('sdk_turn_hash', earlier.turnHash);
  if (error) throw new Error(`Forgetting the lost session failed: ${error.message}`);
  return null;
}

export async function askRequest(input: AskInput): Promise<PreparedJob> {
  const { db, householdId, locale, reads, asOf, earlier } = input;
  const firstHandle = (earlier?.handles ?? 0) + 1;
  const { sheet, cite } = runSheet(firstHandle);
  const stream = answerStream({ sheet, write: ({ content, refs }) => writeAnswer(input, { content_md: content, refs: [...refs] }) });
  let repaired = false;
  let answer: Answer | null = null;
  const tools = new Map([
    ...readTools(db, householdId, { reads, locale, asOf, cite }),
    estaTool('create_proposal', proposalWriter({ db, householdId, jobId: input.jobId, locale, sheet, clock: input.clock }).write),
  ]);
  const topic = earlier === null && input.topic !== null ? await loadTopic(tools, input.topic, { reads, asOf }) : null;
  return {
    prompt:
      earlier === null
        ? askPrompt({ locale, today: asOf, timezone: input.timezone, question: input.question, earlier: input.seed, topic })
        : askFollowUpPrompt({ today: asOf, timezone: input.timezone, question: input.question, firstHandle }),
    ...(earlier === null ? {} : { resume: { sessionId: earlier.sessionId, afterInputHash: earlier.turnHash }, rebuild: () => rebuildOrForgetSession(input, earlier) }),
    ...(input.deep ? { modelRole: 'deep' as const } : {}),
    tools,
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
    async finish({ sessionId, turnHash }): Promise<Json> {
      if (answer === null || answer.text === '') throw new InvalidJobError(`ask ${input.jobId}: the model ended its turn after its tool calls without writing an answer`);
      const { error } = await db.rpc('finish_answer', {
        p_household_id: householdId,
        p_answer_id: input.answerId,
        p_content: answer.text,
        p_refs: [...answer.refs],
        p_handles: firstHandle - 1 + sheet.size,
        ...(sessionId == null ? {} : { p_session_id: sessionId }),
        ...(turnHash === undefined ? {} : { p_turn_hash: turnHash }),
      });
      if (error) throw new Error(`Finishing the answer failed: ${error.message}`);
      return { template: answer.template, cited: answer.cited.map(({ placeholder, value }) => ({ placeholder, value })), refs: [...answer.refs] };
    },
  };
}

type Turn = Pick<AskInput, 'conversationId' | 'questionId' | 'question' | 'answerId' | 'earlier' | 'seed' | 'deep' | 'topic'>;

async function visibleTopic(db: AgentDb, job: AgentJob, question: { topic_item_id: string | null; topic_property_id: string | null }, asker: string | null): Promise<AskTopic | null> {
  if (question.topic_property_id !== null) return { kind: 'property', propertyId: question.topic_property_id };
  if (question.topic_item_id === null) return null;
  const [item, operator] = await Promise.all([
    db.from('agent_items').select('title, body_md, related, audience').eq('household_id', job.household_id).eq('id', question.topic_item_id).single(),
    db.from('household_members').select('is_operator').eq('household_id', job.household_id).eq('user_id', asker ?? '').maybeSingle(),
  ]);
  if (item.error) throw new Error(`Reading the note she replies to failed: ${item.error.message}`);
  if (operator.error) throw new Error(`Reading who asked failed: ${operator.error.message}`);
  if (item.data.audience !== 'all' && operator.data?.is_operator !== true) throw new InvalidJobError(`ask ${job.id}: the note it replies to is for operators only`);
  return { kind: 'note', title: item.data.title, body: item.data.body_md, links: noteRelated(item.data.related).links };
}

async function startTurn(db: AgentDb, job: AgentJob): Promise<Turn> {
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success) throw new InvalidJobError(`ask ${job.id} has no conversation, question and answer`);
  const { conversation_id, question_id, answer_id, deep } = payload.data;
  const [{ data, error }, conversation] = await Promise.all([
    db.from('messages').select('id, role, content_md, topic_item_id, topic_property_id').eq('household_id', job.household_id).eq('conversation_id', conversation_id).in('id', [question_id, answer_id]),
    db.from('conversations').select('sdk_session_id, sdk_turn_hash, sdk_handles, created_by').eq('household_id', job.household_id).eq('id', conversation_id).single(),
  ]);
  if (error) throw new Error(`Reading the question failed: ${error.message}`);
  if (conversation.error) throw new Error(`Reading the conversation failed: ${conversation.error.message}`);
  const question = data.find((row) => row.id === question_id && row.role === 'user');
  if (question === undefined || !data.some((row) => row.id === answer_id && row.role === 'assistant')) throw new InvalidJobError(`ask ${job.id}: the question or its answer is not in conversation ${conversation_id}`);
  await writeAnswer({ db, householdId: job.household_id, answerId: answer_id }, { content_md: '', refs: [], deferred_until: null });
  const { sdk_session_id, sdk_turn_hash, sdk_handles, created_by } = conversation.data;
  const earlier = sdk_turn_hash === null ? null : { sessionId: sdk_session_id, turnHash: sdk_turn_hash, handles: sdk_handles };
  const topic = await visibleTopic(db, job, question, created_by ?? null);
  const seed = earlier === null && topic === null ? await previousSegmentTurns(db, job.household_id, conversation_id, created_by ?? null) : [];

  return { conversationId: conversation_id, questionId: question_id, question: question.content_md, answerId: answer_id, earlier, seed, deep, topic };
}

export async function prepareAsk({ db, job, clock, timezone }: JobContext): Promise<PreparedJob> {
  const [turn, locale, now] = await Promise.all([startTurn(db, job), householdLocale(db, job.household_id), clock()]);
  const asOf = now.today();
  return askRequest({ ...turn, db, householdId: job.household_id, jobId: job.id, locale, asOf, timezone, reads: askReads(db, job.household_id, { locale, asOf }), clock });
}

export async function failAsk({ db, job }: Pick<JobContext, 'db' | 'job'>): Promise<void> {
  const payload = payloadSchema.pick({ answer_id: true }).safeParse(job.payload);
  if (!payload.success) return;
  const { error } = await db.from('messages').update({ content_md: '', status: 'error', refs: [] }).eq('household_id', job.household_id).eq('id', payload.data.answer_id).eq('status', 'streaming');
  if (error) throw new Error(`Marking the answer failed: ${error.message}`);
}
