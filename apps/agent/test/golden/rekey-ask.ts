import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inputHash, type CanonicalInput } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, recordingPath, recordingSchema, writeRecording, type Recording } from '../../src/replay/store';
import { repairTexts } from '@esta/core/guard';
import { askPrompt, repairTail } from '../../src/prompts/ask';
import { ASK_CONTEXT, askCase, caseInput } from './ask-cases';

/** A first-turn prompt opens with the system prompt; follow-up and repair prompts do not. */
const OPENING = 'Bạn là Trợ lý';
const TODAY = /\nToday is (\d{4}-\d{2}-\d{2}) in /u;

/** The rules every first-turn ask prompt opens with, up to the end of the last one, for the day it is asked. */
export function currentHead(today: string): string {
  const prompt = askPrompt({ ...ASK_CONTEXT, today: today as typeof ASK_CONTEXT.today, question: 'x', labels: [] });
  const rules = prompt.indexOf('\n6. ');
  return prompt.slice(0, prompt.indexOf('\n', rules + 1));
}

export function headOf(prompt: string): string | null {
  const rules = prompt.indexOf('\n6. ');
  return prompt.startsWith(OPENING) && rules >= 0 ? prompt.slice(0, prompt.indexOf('\n', rules + 1)) : null;
}

/** The closing line repair turns were recorded with before it named the rejected words (P5-10d). */
const OLD_REPAIR_TAIL = '\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.';

/** A repair prompt recorded with the old closing line, now with the current one; any other prompt as it is. */
export const withCurrentRepairTail = (prompt: string): string =>
  prompt.endsWith(OLD_REPAIR_TAIL) ? `${prompt.slice(0, -OLD_REPAIR_TAIL.length)}\n${repairTail(repairTexts(prompt))}` : prompt;

/** The key of a recording's input as the store writes it. */
export const hashOf = (input: Recording['input']): string => inputHash(input as CanonicalInput);

export const dayOf = (prompt: string): string | null => TODAY.exec(prompt)?.[1] ?? null;

/** Every directory named `ask` under `dir`, with the recordings in it. */
export function askRecordingFiles(dir: string = DEFAULT_REPLAY_DIR): string[] {
  const found: string[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(at, entry.name);
      if (entry.name === 'ask') found.push(...readdirSync(path).filter((file) => file.endsWith('.json')).map((file) => join(path, file)));
      else walk(path);
    }
  };
  walk(dir);
  return found.sort();
}

export const readAskRecording = (file: string): Recording => recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

/** The tools and turn limit a first-turn ask is offered today. */
export async function currentOffer() {
  const { builtInTools, mcpTools, maxTurns } = await caseInput(askCase('q1-di-an-income'));
  return { builtInTools, mcpTools, maxTurns };
}

/**
 * Re-keys every ask recording to today's prompt: the rules at the start of a first-turn prompt and the tools it offers
 * are taken from the code, the rest of the prompt, the tool calls and the reply stay as recorded, and a turn that
 * resumes another follows that one's new key. Returns the files written and removed.
 */
export async function rekeyAsk(dir: string = DEFAULT_REPLAY_DIR): Promise<{ written: string[]; removed: string[] }> {
  const offer = await currentOffer();
  const old = new Map<string, { file: string; recording: Recording }>();
  const dirOf = new Map<string, string>();
  for (const file of askRecordingFiles(dir)) {
    const recording = readAskRecording(file);
    old.set(recording.inputHash, { file, recording });
    dirOf.set(recording.inputHash, join(file, '..', '..'));
  }
  const renamed = new Map<string, string>();
  const rekeyed = new Map<string, Recording>();
  const settle = (hash: string): void => {
    if (rekeyed.has(hash)) return;
    const { recording } = old.get(hash) ?? { recording: undefined };
    if (recording === undefined) return;
    const resumes = recording.input.resumesInputHash;
    if (resumes !== undefined && old.has(resumes)) settle(resumes);
    const prompt = withCurrentRepairTail(recording.input.prompt);
    const head = headOf(prompt);
    const day = dayOf(prompt);
    const next = head === null || day === null ? prompt : currentHead(day) + prompt.slice(head.length);
    const { resumesInputHash: _resumes, ...rest } = recording.input;
    const input = { ...rest, prompt, ...(head === null ? {} : { prompt: next, ...offer }), ...(resumes === undefined ? {} : { resumesInputHash: renamed.get(resumes) ?? resumes }) };
    const key = hashOf(input);
    renamed.set(hash, key);
    rekeyed.set(hash, { ...recording, input, inputHash: key });
  };
  for (const hash of old.keys()) settle(hash);
  const written: string[] = [];
  const removed: string[] = [];
  for (const [hash, recording] of rekeyed) {
    const from = old.get(hash);
    if (from === undefined || recording.inputHash === hash) continue;
    rmSync(from.file);
    removed.push(from.file);
  }
  for (const [hash, recording] of rekeyed) {
    const at = dirOf.get(hash) ?? dir;
    if (recording.inputHash === hash && existsSync(recordingPath(at, 'ask', hash))) continue;
    written.push(writeRecording(at, recording));
  }
  return { written, removed };
}

/** The folders to re-key: the main set and each case folder beside it (`agent-replay-cases/<case>`) that holds ask recordings. */
export function askRecordingDirs(main: string = DEFAULT_REPLAY_DIR, cases: string = join(main, '..', 'agent-replay-cases')): string[] {
  return [main, ...readdirSync(cases).map((name) => join(cases, name)).filter((dir) => existsSync(join(dir, 'ask')))];
}

if (import.meta.main) {
  const results = [];
  for (const dir of askRecordingDirs()) results.push(await rekeyAsk(dir));
  console.log(`Re-keyed ${results.flatMap((r) => r.written).length} ask recordings, removed ${results.flatMap((r) => r.removed).length} old keys`);
}
