export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { exitOnFrozenProductionClock } = await import('./server/start-guard');
    exitOnFrozenProductionClock();
  }
}
