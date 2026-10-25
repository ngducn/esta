'use server';

import type { Result } from '@esta/core/result';
import { askQuestion, runOp, type Asked } from '@esta/ops';
import { webOpContext } from '@/server/ops';

export async function sendQuestion(raw: unknown): Promise<Result<Asked, 'invalid' | 'busy' | 'failed'>> {
  const asked = await runOp(askQuestion, await webOpContext(), raw);
  if (!asked.ok) return { ok: false, reason: asked.reason.kind === 'invalid' || asked.reason.kind === 'busy' ? asked.reason.kind : 'failed' };
  return asked;
}
