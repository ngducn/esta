import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { readAnswer, type AnswerState } from '@/server/agent/conversations';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const POLL_MS = 250;
/** The ask job's two minutes, its repair turn and a queue wait; then the page keeps what it has and stops listening. */
const LISTEN_MS = 5 * 60_000;

const params = z.object({ answerId: z.uuid(), conversation: z.uuid() });
const headers = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };

const event = (state: AnswerState | { readonly status: 'timeout' | 'gone' }) => new TextEncoder().encode(`data: ${JSON.stringify(state)}\n\n`);

/**
 * The answer as it streams (AGENT.md §5.6), as server-sent events read through the member's session client, so RLS is
 * the one boundary and the page holds no database token. It sends the row each time it changes and closes when the
 * answer is done or failed, when the page goes away, or after `LISTEN_MS`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ answerId: string }> }) {
  const parsed = params.safeParse({ ...(await context.params), conversation: request.nextUrl.searchParams.get('conversation') });
  const member = await getCurrentMember();
  if (!parsed.success || member === null) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const { answerId, conversation } = parsed.data;
  const db = await createSessionClient();
  const started = Date.now();
  const { signal } = request;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = '';
      try {
        while (!signal.aborted) {
          const state = await readAnswer(db, member.household.id, conversation, answerId);
          if (state === null) {
            controller.enqueue(event({ status: 'gone' }));
            break;
          }
          const text = JSON.stringify(state);
          if (text !== last) controller.enqueue(event(state));
          last = text;
          if (state.status !== 'streaming') break;
          if (Date.now() - started > LISTEN_MS) {
            controller.enqueue(event({ status: 'timeout' }));
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!signal.aborted) controller.close();
      }
    },
  });
  return new Response(body, { headers });
}
