import { assertClockAllowed } from '@esta/core';

// A throw from register() leaves `next start` up without serving, so the refusal exits the process.
export function exitOnFrozenProductionClock(): void {
  try {
    assertClockAllowed(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
