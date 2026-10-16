import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { inputHash, type CanonicalInput } from './canonicalize';

export const DEFAULT_REPLAY_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'fixtures', 'agent-replay');

const recordingSchema = z.object({
  version: z.literal(1),
  kind: z.string(),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  input: z.object({
    version: z.literal(1),
    kind: z.string(),
    prompt: z.string(),
    builtInTools: z.array(z.string()),
    mcpTools: z.array(z.string()),
    maxTurns: z.number().int(),
  }),
  model: z.string().min(1),
  numTurns: z.number().int().nonnegative(),
  toolCalls: z.array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) })),
  reply: z.string(),
});

export type Recording = z.infer<typeof recordingSchema>;

export class MissingRecordingError extends Error {
  readonly hash: string;

  constructor(kind: string, hash: string, path: string) {
    super(`No replay recording for ${kind} input ${hash} at ${path}. Run pnpm agent:record to record it.`);
    this.name = 'MissingRecordingError';
    this.hash = hash;
  }
}

export function recordingPath(dir: string, kind: string, hash: string): string {
  return join(dir, kind, `${hash}.json`);
}

export function readRecording(dir: string, input: CanonicalInput): Recording {
  const hash = inputHash(input);
  const path = recordingPath(dir, input.kind, hash);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new MissingRecordingError(input.kind, hash, path);
  }
  const recording = recordingSchema.parse(JSON.parse(raw));
  if (recording.inputHash !== hash) throw new Error(`${path} records input ${recording.inputHash}, not ${hash}`);
  return recording;
}

export function writeRecording(dir: string, recording: Recording): string {
  const path = recordingPath(dir, recording.kind, recording.inputHash);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(recordingSchema.parse(recording), null, 2)}\n`);
  return path;
}
