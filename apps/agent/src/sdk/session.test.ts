import type { McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { JOBS } from '../jobs/registry';
import { canonicalizer } from '../replay/canonicalize';
import { estaTool, ToolRejection } from '../tools/server';
import { liveSession } from './session';

/**
 * Stands in for the model: it calls save_extraction once through the in-process server, then ends the way the SDK
 * does, with a result, or by throwing once the session was aborted.
 */
async function* modelThatSavesOnce({ options }: { options: Options }) {
  const server = options.mcpServers?.esta as McpSdkServerConfigWithInstance;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: 'model', version: '1.0.0' });
  await client.connect(clientSide);
  const answer = await client.callTool({ name: 'save_extraction', arguments: { result: {} } });
  await client.close();
  if (options.abortController?.signal.aborted === true) throw new Error('Claude Code process aborted by user');
  yield { type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer.content), num_turns: 2, session_id: 's1', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] };
}

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>()),
  query: (input: { options: Options }) => modelThatSavesOnce(input),
}));

const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-session-')));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

const live = { agentMode: 'live', authMode: 'api_key', credential: { name: 'ANTHROPIC_API_KEY', value: 'unused' }, model: 'claude-sonnet-5-5' } as const;

const sessionSaving = (run: () => Promise<unknown>) =>
  liveSession(
    { spec: JOBS.extract_document, prompt: 'Read the file.', jobDir, configDir: jobDir, tools: new Map([estaTool('save_extraction', run)]), canon: canonicalizer({ householdName: 'Gia đình Demo' }) },
    live,
  );

describe('liveSession and the tool error boundary (AGENT.md §9)', () => {
  it('hands a rejection to the model, which reads it and goes on', async () => {
    const run = await sessionSaving(() => Promise.reject(new ToolRejection('parcels.0.area_m2: Expected number')));
    expect(run.result).toMatchObject({ isError: false, text: JSON.stringify([{ type: 'text', text: 'parcels.0.area_m2: Expected number' }]) });
  });

  it('fails the session with the error a tool hit, so the job records the real cause', async () => {
    const failure = new Error('Writing the review item failed: permission denied for table agent_items');
    await expect(sessionSaving(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});
