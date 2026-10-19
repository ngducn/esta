/** `Reason` is a string, or a refusal object such as the ops layer's `{ kind: 'code_taken', code, takenBy }`. */
export type Result<T, Reason = string> = { ok: true; value: T } | { ok: false; reason: Reason };
