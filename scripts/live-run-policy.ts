export type RunMode = 'live' | 'replay';

export type ResultRow = { readonly id: string; readonly check: string; readonly pass: boolean | null; readonly detail: string };

/** A run that names no mode replays the recordings, so only a typed `--mode live` calls the model. */
export function resolveMode(flag: string | undefined): RunMode {
  const mode = flag ?? 'replay';
  if (mode !== 'live' && mode !== 'replay') throw new Error(`--mode is live or replay, not ${mode}`);
  return mode;
}

/** A failed row always fails the run; a row not run fails a live run, which must cover every row the plan requires. */
export function exitCodeFor(rows: readonly ResultRow[], mode: RunMode): 0 | 1 {
  return rows.some((row) => row.pass === false || (mode === 'live' && row.pass === null)) ? 1 : 0;
}
