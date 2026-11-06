import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inputHash, type CanonicalInput } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, recordingPath, recordingSchema, writeRecording, type Recording } from '../../src/replay/store';
import { askPrompt } from '../../src/prompts/ask';
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
 * The repair lines to drop, by the key of the repair turn they are in: a text the guard no longer rejects (`hai bên` as
 * both parties, P5-10d) is no longer named, so the repair message the same reply is sent back with has one line fewer.
 */
export const DROPPED_REPAIR_LINES: ReadonlyMap<string, readonly string[]> = new Map([
  ['0350c82652036b01efc9a2b8627f7f938c3b6b18cc3ad98f4b1b5af72e8a6a4c', ['hai']],
]);

const withoutLines = (prompt: string, texts: readonly string[]): string =>
  prompt
    .split('\n')
    .filter((line) => !texts.some((text) => line.startsWith(`"${text}": `)))
    .join('\n');

/**
 * Re-keys every ask recording to today's prompt: the rules at the start of a first-turn prompt and the tools it offers
 * are taken from the code, the rest of the prompt, the tool calls and the reply stay as recorded, and a turn that
 * resumes another follows that one's new key. Returns the files written and removed.
 */
export async function rekeyAsk(dir: string = DEFAULT_REPLAY_DIR, dropped: ReadonlyMap<string, readonly string[]> = DROPPED_REPAIR_LINES): Promise<{ written: string[]; removed: string[] }> {
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
    const drops = dropped.get(hash);
    const prompt = drops === undefined ? recording.input.prompt : withoutLines(recording.input.prompt, drops);
    const head = headOf(prompt);
    const day = dayOf(prompt);
    const next = head === null || day === null ? prompt : currentHead(day) + prompt.slice(head.length);
    const { resumesInputHash: _resumes, ...rest } = recording.input;
    const input = { ...rest, prompt, ...(head === null ? {} : { prompt: next, ...offer }), ...(resumes === undefined ? {} : { resumesInputHash: renamed.get(resumes) ?? resumes }) };
    const key = hashOf(input);
    renamed.set(hash, key);
    rekeyed.set(hash, { ...recording, input, inputHash: key, ...(drops === undefined ? {} : { label: `${recording.label} Repair line dropped for ${drops.join(', ')} (P5-10d): the guard no longer rejects it.` }) });
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

if (import.meta.main) {
  const { written, removed } = await rekeyAsk();
  console.log(`Re-keyed ${written.length} ask recordings, removed ${removed.length} old keys`);
}
