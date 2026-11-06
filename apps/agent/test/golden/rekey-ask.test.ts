import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairMessage } from '@esta/core/guard';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../../src/replay/store';
import { askRecordingFiles, currentHead, currentOffer, dayOf, hashOf, headOf, readAskRecording, rekeyAsk, withCurrentRepairTail } from './rekey-ask';

describe('ask recordings are keyed to the current prompt (re-keyed only by script)', () => {
  const files = askRecordingFiles();

  it('finds the hand-written, probe and north-star recordings', () => {
    expect(files.some((file) => file.includes(`${join('northstar', 'ask')}`))).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it('keys every recording by the hash of its input, to the current rules and tools, and resumes only a recording that exists', async () => {
    const offer = await currentOffer();
    const hashes = new Set(files.map((file) => readAskRecording(file).inputHash));
    const stale: string[] = [];
    for (const file of files) {
      const recording = readAskRecording(file);
      const { prompt } = recording.input;
      const head = headOf(prompt);
      const day = dayOf(prompt);
      const keyed = hashOf(recording.input) === recording.inputHash && file.endsWith(`${recording.inputHash}.json`);
      const current = head === null || (day !== null && head === currentHead(day) && JSON.stringify([recording.input.builtInTools, recording.input.mcpTools, recording.input.maxTurns]) === JSON.stringify([offer.builtInTools, offer.mcpTools, offer.maxTurns]));
      const chained = recording.input.resumesInputHash === undefined || hashes.has(recording.input.resumesInputHash);
      if (!keyed || !current || !chained) stale.push(`${file}: run pnpm --filter agent golden:ask`);
    }
    expect(stale).toEqual([]);
  });

  it('re-keys a recording whose rules are old and its follower, and keeps the reply and tool calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'esta-rekey-'));
    cpSync(join(DEFAULT_REPLAY_DIR, 'northstar'), join(dir, 'northstar'), { recursive: true });
    const [file] = askRecordingFiles(dir);
    const first = readAskRecording(file ?? '');
    const oldInput = { ...first.input, prompt: first.input.prompt.replace('\n6. ', '\n6. (old rule) '), mcpTools: first.input.mcpTools.slice(1) };
    const old = { ...first, input: oldInput, inputHash: hashOf(oldInput) };
    const followInput = { ...first.input, prompt: 'Write it again.', resumesInputHash: old.inputHash };
    const follower = { ...first, input: followInput, inputHash: hashOf(followInput), reply: 'again' };
    const target = join(dir, 'northstar');
    rmSync(file ?? '');
    writeRecording(target, old);
    writeRecording(target, follower);
    await rekeyAsk(dir);
    const after = askRecordingFiles(dir).map(readAskRecording);
    const head = after.find(({ reply }) => reply === first.reply);
    const next = after.find(({ reply }) => reply === 'again');
    expect(askRecordingFiles(dir)).toHaveLength(2);
    expect(head?.inputHash).toBe(first.inputHash);
    expect(head?.toolCalls).toEqual(first.toolCalls);
    expect(next?.input.resumesInputHash).toBe(first.inputHash);
    expect(next?.inputHash).toBe(hashOf(next?.input ?? first.input));
    expect(existsSync(join(target, 'ask', `${old.inputHash}.json`))).toBe(false);
  });

  it('gives a repair turn recorded with the old closing line the one that names the rejected words', () => {
    const old = `${repairMessage([{ rule: 'word', text: 'hai' }, { rule: 'number', text: '5' }])}\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.`;
    expect(withCurrentRepairTail(old)).toContain('without these exact words ("hai", "5")');
    expect(withCurrentRepairTail(withCurrentRepairTail(old))).toBe(withCurrentRepairTail(old));
  });
});
