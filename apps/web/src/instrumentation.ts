import { assertClockAllowed } from '@esta/core';

export function register(): void {
  assertClockAllowed(process.env);
}
