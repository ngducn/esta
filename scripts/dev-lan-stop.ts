export type Watched = { readonly ppid: number; on(signal: NodeJS.Signals, listener: () => void): unknown };

export function stopWhenOrphaned(proc: Watched, stop: () => void, pollMs: number): void {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) proc.on(signal, stop);
  const parent = proc.ppid;
  setInterval(() => {
    if (proc.ppid !== parent) stop();
  }, pollMs).unref();
}
