'use server';

import type { Result } from '@esta/core/result';
import { askQuestion, runOp, type Asked } from '@esta/ops';
import { webOpContext } from '@/server/ops';

/** Hỏi: the question, its answer row and the ask job land in one transaction through the member's session (AGENT.md §5.6). */
export async function sendQuestion(raw: unknown): Promise<Result<Asked, 'invalid' | 'failed'>> {
  const asked = await runOp(askQuestion, await webOpContext(), raw);
  if (!asked.ok) return { ok: false, reason: asked.reason.kind === 'invalid' ? 'invalid' : 'failed' };
  return asked;
}
