import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { recordingSchema, type Recording } from '../../src/replay/store';
import { HAND_WRITTEN, rewriteWatchRecordings } from './watch-recording';

const scratch = mkdtempSync(join(tmpdir(), 'esta-watch-recording-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const stand = (model: string, hash: string): Recording =>
  recordingSchema.parse({
    version: 1,
    kind: 'portfolio_watch',
    inputHash: hash.repeat(64),
    input: { version: 1, kind: 'portfolio_watch', prompt: `prompt ${hash}`, builtInTools: [], mcpTools: [], maxTurns: 8 },
    model,
    numTurns: 1,
    toolCalls: [],
    reply: 'xong',
  });

describe('golden:watch rewrites its own recordings and no others', () => {
  it('removes the hand-written recordings it replaces and keeps a live one recorded later', () => {
    const replay = join(scratch, 'replay');
    const cases = join(scratch, 'cases');
    const watch = join(replay, 'portfolio_watch');
    const old = stand(HAND_WRITTEN, 'a');
    const live = stand('claude-sonnet-5-5', 'b');
    for (const recording of [old, live]) {
      mkdirSync(watch, { recursive: true });
      writeFileSync(join(watch, `${recording.inputHash}.json`), `${JSON.stringify(recording)}\n`);
    }
    writeFileSync(join(watch, 'notes.txt'), 'not a recording');
    mkdirSync(cases, { recursive: true });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      rewriteWatchRecordings({ replay, cases });
    } finally {
      log.mockRestore();
    }

    const left = readdirSync(watch);
    expect(left, 'a live recording and a file that is not a recording stay').toEqual(expect.arrayContaining([`${live.inputHash}.json`, 'notes.txt']));
    expect(left, 'the old hand-written recording goes').not.toContain(`${old.inputHash}.json`);
    expect(left, 'one new hand-written recording per locale').toHaveLength(4);
  });
});
