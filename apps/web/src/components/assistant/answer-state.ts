import { isSourceRef, type AnswerRef } from '@esta/core/assistant';

/** `deferred` is a streaming row the daily ask cap moved to the next local midnight (`messages.deferred_until`). */
const ANSWER_STATUSES = ['streaming', 'deferred', 'done', 'error'] as const;
const STOPPED = ['timeout', 'gone'] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/** An answer as its page shows it: the guarded text so far and the record links its run looked up (`messages.refs`). */
export type AnswerState = { readonly content: string; readonly status: AnswerStatus; readonly refs: readonly AnswerRef[]; /** `web` while a web tool runs before the first sentence (`messages.activity`). */ readonly activity?: 'web' | null };

/** One server-sent event of `/api/answers/{id}`. */
export type AnswerEvent = AnswerState | { readonly status: (typeof STOPPED)[number] };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T => (options as readonly unknown[]).includes(value);

export function isAnswerState(value: unknown): value is AnswerState {
  return isObject(value) && typeof value.content === 'string' && isOneOf(ANSWER_STATUSES, value.status) && Array.isArray(value.refs) && value.refs.every((ref) => typeof ref === 'string' || isSourceRef(ref)) && (value.activity === undefined || value.activity === null || value.activity === 'web');
}

export function isAnswerEvent(value: unknown): value is AnswerEvent {
  return isAnswerState(value) || (isObject(value) && !('content' in value) && isOneOf(STOPPED, value.status));
}
