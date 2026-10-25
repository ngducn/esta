const ANSWER_STATUSES = ['streaming', 'done', 'error'] as const;
const STOPPED = ['timeout', 'gone'] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/** An answer as its page shows it: the guarded text so far and the record links its run looked up (`messages.refs`). */
export type AnswerState = { readonly content: string; readonly status: AnswerStatus; readonly refs: readonly string[] };

/** One server-sent event of `/api/answers/{id}`. */
export type AnswerEvent = AnswerState | { readonly status: (typeof STOPPED)[number] };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T => (options as readonly unknown[]).includes(value);

export function isAnswerState(value: unknown): value is AnswerState {
  return isObject(value) && typeof value.content === 'string' && isOneOf(ANSWER_STATUSES, value.status) && Array.isArray(value.refs) && value.refs.every((ref) => typeof ref === 'string');
}

export function isAnswerEvent(value: unknown): value is AnswerEvent {
  return isAnswerState(value) || (isObject(value) && !('content' in value) && isOneOf(STOPPED, value.status));
}
