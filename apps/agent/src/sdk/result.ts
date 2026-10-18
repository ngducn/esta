import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Json } from '@esta/db';

export type SessionResult = {
  readonly isError: boolean;
  readonly subtype: string;
  readonly text: string;
  readonly numTurns: number;
  readonly sessionId: string | null;
  readonly costUsd: number;
  readonly usage: Json;
  readonly modelUsage: Json;
  readonly permissionDenials: Json;
};

export function fromSdkResult(message: SDKResultMessage): SessionResult {
  return {
    isError: message.is_error,
    subtype: message.subtype,
    text: message.subtype === 'success' ? message.result : message.errors.join('\n'),
    numTurns: message.num_turns,
    sessionId: message.session_id,
    costUsd: message.total_cost_usd,
    usage: message.usage as unknown as Json,
    modelUsage: message.modelUsage as unknown as Json,
    permissionDenials: message.permission_denials as unknown as Json,
  };
}

export type FailureKind = 'auth_error' | 'missing_recording' | 'invalid_job' | 'error';

export type Failure = { readonly kind: FailureKind; readonly message: string };

export type Outcome = { readonly ok: true; readonly reply: string } | { readonly ok: false; readonly failure: Failure };

const AUTH_ERROR = /\b401\b|failed to authenticate|not logged in|invalid (x-)?api[ -]key|oauth access token/i;

/** An auth failure arrives as `subtype: 'success'` with `is_error: true` (S1 correction 5). */
export function judgeResult(result: SessionResult): Outcome {
  if (!result.isError && result.subtype === 'success') return { ok: true, reply: result.text };
  const message = result.text.trim() === '' ? `The model session ended with ${result.subtype}` : result.text.trim();
  return { ok: false, failure: { kind: AUTH_ERROR.test(message) ? 'auth_error' : 'error', message } };
}

export function countToolCalls(names: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}
