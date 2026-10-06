export type Result<T, Reason extends string> = { ok: true; value: T } | { ok: false; reason: Reason };
