import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { JOBS } from '../jobs/registry';
import { canonicalizer } from '../replay/canonicalize';
import { liveSession, replayChunks } from './session';

const seen: Options[] = [];

const event = (payload: Record<string, unknown>) => ({ type: 'stream_event', event: payload, parent_tool_use_id: null, uuid: 'u', session_id: 's1' });

/** A model that writes a sentence, calls a tool in a second block, then writes another, as streamed events. */
async function* streamingModel({ options }: { options: Options }) {
  seen.push(options);
  yield event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  yield event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Đã ' } });
  yield event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'xem.' } });
  yield event({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't', name: 'x', input: {} } });
  yield event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  yield event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hết.' } });
  yield { type: 'result', subtype: 'success', is_error: false, result: 'Hết.', num_turns: 2, session_id: 's2', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] };
}

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>()),
  query: (input: { options: Options }) => streamingModel(input),
}));

const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-stream-')));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

describe('a streaming session (AGENT.md §5.6)', () => {
  it('hands each text delta over as it arrives, with a blank line between text blocks, and resumes the session it names', async () => {
    const texts: string[] = [];
    const run = await liveSession(
      {
        spec: JOBS.ask,
        prompt: 'Câu hỏi',
        jobDir,
        configDir: jobDir,
        tools: new Map(),
        canon: canonicalizer({ householdName: 'Gia đình Demo' }),
        onText: async (delta) => void texts.push(delta),
        resume: { sessionId: 's1', after: 'a'.repeat(64) },
      },
      { agentMode: 'live', authMode: 'api_key', model: 'routine-model', credential: { name: 'ANTHROPIC_API_KEY', value: 'test-key' } },
    );
    expect(texts).toEqual(['Đã ', 'xem.', '\n\n', 'Hết.']);
    expect(run.result.sessionId).toBe('s2');
    expect(seen.at(-1)).toMatchObject({ includePartialMessages: true, resume: 's1', persistSession: true, cwd: jobDir });
  });

  it('in replay cuts the reply into short pieces that join back to it, never splitting a character', () => {
    const reply = 'Từ đầu tháng {{f8.period_date_display}}, đã thu {{f8.income_display}} 🏠.';
    const chunks = replayChunks(reply);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join('')).toBe(reply);
    expect(chunks.some((chunk) => /[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(chunk)), 'no piece ends or starts inside a surrogate pair').toBe(false);
  });
});
