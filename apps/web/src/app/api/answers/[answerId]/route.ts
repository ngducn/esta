import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AnswerEvent } from '@/components/assistant/answer-state';
import { readAnswer } from '@/server/agent/conversations';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const POLL_MS = 250;
const LISTEN_MS = 5 * 60_000;

const params = z.object({ answerId: z.uuid(), conversation: z.uuid() });
const headers = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };

const event = (state: AnswerEvent) => new TextEncoder().encode(`data: ${JSON.stringify(state)}\n\n`);

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
