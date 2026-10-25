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
  /** Why the SDK stopped, from an assistant message's `error` or a rejected rate limit event, when it said. */
  readonly cause: string | null;
};

export function fromSdkResult(message: SDKResultMessage, cause: string | null): SessionResult {
  return {
    cause,
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

export type FailureKind = 'auth_error' | 'usage_limit' | 'missing_recording' | 'invalid_job' | 'number_guard' | 'error';

export type Failure = { readonly kind: FailureKind; readonly message: string };

export type Outcome = { readonly ok: true; readonly reply: string } | { readonly ok: false; readonly failure: Failure };

const AUTH_ERROR = /\b401\b|failed to authenticate|not logged in|invalid (x-)?api[ -]key|oauth access token/i;

/** [verify] the subscription's limit text in the P5-10 live run; the SDK's `rate_limit` cause is the primary signal. */
const USAGE_LIMIT = /usage limit|hit your limit|limit reached|rate[ _-]limit|\b429\b/i;

function failureKind(cause: string | null, message: string): FailureKind {
  if (cause === 'rate_limit' || (cause === null && USAGE_LIMIT.test(message))) return 'usage_limit';
  if (cause === 'authentication_failed' || AUTH_ERROR.test(message)) return 'auth_error';
  return 'error';
}

/** An auth failure arrives as `subtype: 'success'` with `is_error: true` (S1 correction 5). */
export function judgeResult(result: SessionResult): Outcome {
  if (!result.isError && result.subtype === 'success') return { ok: true, reply: result.text };
  const message = result.text.trim() === '' ? `The model session ended with ${result.subtype}` : result.text.trim();
  return { ok: false, failure: { kind: failureKind(result.cause, message), message } };
}

export function countToolCalls(names: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}
