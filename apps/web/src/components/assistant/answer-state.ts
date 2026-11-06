import type { AnswerRef, CalcRef, SourceRef } from '@esta/core/assistant';

/** `deferred` is a streaming row the daily ask cap moved to the next local midnight (`messages.deferred_until`). */
const ANSWER_STATUSES = ['streaming', 'deferred', 'done', 'error'] as const;
const STOPPED = ['timeout', 'gone'] as const;

type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/** An answer as its page shows it: the guarded text so far and the record links its run looked up (`messages.refs`). */
export type AnswerState = { readonly content: string; readonly status: AnswerStatus; readonly refs: readonly AnswerRef[]; /** `web` while a web tool runs before the first sentence (`messages.activity`). */ readonly activity?: 'web' | null };

/** One server-sent event of `/api/answers/{id}`. */
export type AnswerEvent = AnswerState | { readonly status: (typeof STOPPED)[number] };

/** Mirrors `isSourceRef` of `@esta/core/assistant`, which a client island must not import: its barrel drags the whole assistant module into the initial bundle. */
export const isSourceRef = (ref: unknown): ref is SourceRef => isObject(ref) && ref.kind === 'source' && typeof ref.url === 'string' && typeof ref.n === 'number' && typeof ref.source_name === 'string';

/** Mirrors `isCalcRef` of `@esta/core/assistant`. */
export const isCalcRef = (ref: unknown): ref is CalcRef => isObject(ref) && ref.kind === 'calc' && typeof ref.working === 'string';

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T => (options as readonly unknown[]).includes(value);

export function isAnswerState(value: unknown): value is AnswerState {
  return isObject(value) && typeof value.content === 'string' && isOneOf(ANSWER_STATUSES, value.status) && Array.isArray(value.refs) && value.refs.every((ref) => typeof ref === 'string' || isSourceRef(ref) || isCalcRef(ref)) && (value.activity === undefined || value.activity === null || value.activity === 'web');
}

export function isAnswerEvent(value: unknown): value is AnswerEvent {
  return isAnswerState(value) || (isObject(value) && !('content' in value) && isOneOf(STOPPED, value.status));
}
