import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { inputHash, type CanonicalInput } from './canonicalize';
import { MissingRecordingError, readRecording, recordingPath, writeRecording } from './store';

const dir = mkdtempSync(join(tmpdir(), 'esta-replay-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const input: CanonicalInput = { version: 1, kind: 'ping', prompt: 'p', builtInTools: [], mcpTools: ['household_info'], maxTurns: 3 };

describe('replay store', () => {
  it('throws MissingRecordingError naming the 64-character hash and pnpm agent:record', () => {
    const hash = inputHash(input);
    const read = () => readRecording(dir, input);
    expect(read).toThrow(MissingRecordingError);
    expect(read).toThrow(`No replay recording for ping input ${hash} at ${recordingPath(dir, 'ping', hash)}. Run pnpm agent:record to record it.`);
  });

  it('reads back what it wrote under <kind>/<hash>.json', () => {
    const recording = {
      version: 1 as const,
      kind: 'ping',
      inputHash: inputHash(input),
      input,
      model: 'routine-model',
      numTurns: 2,
      toolCalls: [{ name: 'mcp__esta__household_info', input: {} }],
      reply: 'Kết nối tốt cho <household>.',
    };
    expect(writeRecording(dir, recording)).toBe(join(dir, 'ping', `${inputHash(input)}.json`));
    expect(readRecording(dir, input)).toEqual(recording);
  });
});
