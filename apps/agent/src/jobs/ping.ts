import type { AgentDb } from '../supabase';
import { householdInfo } from '../tools/household-info';
import { estaTool, type EstaTools } from '../tools/server';
import type { PreparedJob } from './registry';

/** Carries no date, id or household name, so one recording replays at any clock for every household (AGENT.md §8). */
export const PING_PROMPT = [
  'This is a connection check for Esta, a family property app.',
  'Call the household_info tool once.',
  "Then reply with exactly one sentence in the household's locale (vi means Vietnamese) that says the connection works and names the household exactly as the tool returned it.",
  'Write nothing else: no numbers, no lists, no emoji.',
].join('\n');

export type PingResult = { readonly reply: string };

export const pingTools = (db: AgentDb, householdId: string): EstaTools => new Map([estaTool('household_info', () => householdInfo(db, householdId))]);

export function preparePing({ db, job }: { db: AgentDb; job: { household_id: string } }): Promise<PreparedJob> {
  return Promise.resolve({
    prompt: PING_PROMPT,
    tools: pingTools(db, job.household_id),
    finish: ({ reply }) => Promise.resolve({ reply } satisfies PingResult),
  });
}
