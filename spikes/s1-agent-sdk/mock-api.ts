import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type ScriptedCall = { name: string; input: Record<string, unknown> };

type ApiRequest = {
  model?: string;
  stream?: boolean;
  tools?: Array<{ name: string }>;
  messages?: Array<{ role: string; content: unknown }>;
};

export type MockApi = { url: string; log: string[]; close: () => Promise<void> };

function countToolUses(messages: ApiRequest['messages']): number {
  let n = 0;
  for (const m of messages ?? []) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content as Array<{ type?: string }>) if (block.type === 'tool_use') n++;
  }
  return n;
}

function lastToolResults(messages: ApiRequest['messages']): string[] {
  const last = messages?.at(-1);
  if (!last || last.role !== 'user' || !Array.isArray(last.content)) return [];
  return (last.content as Array<{ type?: string; content?: unknown; is_error?: boolean }>)
    .filter((b) => b.type === 'tool_result')
    .map((b) => `${b.is_error ? 'ERROR ' : ''}${JSON.stringify(b.content).slice(0, 220)}`);
}

function sse(res: ServerResponse, events: Array<Record<string, unknown>>): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write(`event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

function reply(res: ServerResponse, body: ApiRequest, block: Record<string, unknown>, stop: string): void {
  const model = body.model ?? 'mock';
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const message = { id: `msg_mock_${Date.now()}`, type: 'message', role: 'assistant', model, stop_sequence: null };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...message, content: [block], stop_reason: stop, usage }));
    return;
  }
  const start = block.type === 'tool_use' ? { ...block, input: {} } : { type: 'text', text: '' };
  const delta =
    block.type === 'tool_use'
      ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
      : { type: 'text_delta', text: String(block.text) };
  sse(res, [
    { type: 'message_start', message: { ...message, content: [], stop_reason: null, usage } },
    { type: 'content_block_start', index: 0, content_block: start },
    { type: 'content_block_delta', index: 0, delta },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ]);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startMockApi(script: ScriptedCall[]): Promise<MockApi> {
  const log: string[] = [];
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const path = (req.url ?? '').split('?')[0] ?? '';
    const auth = req.headers.authorization ? 'bearer' : req.headers['x-api-key'] ? 'x-api-key' : 'none';
    if (path.endsWith('/count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ input_tokens: 10 }));
      return;
    }
    if (!path.endsWith('/v1/messages')) {
      log.push(`${req.method} ${path} auth=${auth} -> 404`);
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(raw) as ApiRequest;
    const toolNames = (body.tools ?? []).map((t) => t.name);
    if (!toolNames.includes('Read')) {
      reply(res, body, { type: 'text', text: 'ok' }, 'end_turn');
      return;
    }
    const step = countToolUses(body.messages);
    for (const r of lastToolResults(body.messages)) log.push(`  tool_result: ${r}`);
    log.push(`POST /v1/messages auth=${auth} step=${step} tools=[${toolNames.join(',')}]`);
    const call = script[step];
    if (call) {
      reply(res, body, { type: 'tool_use', id: `toolu_mock_${step}`, name: call.name, input: call.input }, 'tool_use');
    } else {
      reply(res, body, { type: 'text', text: 'MOCK DONE' }, 'end_turn');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    log,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
