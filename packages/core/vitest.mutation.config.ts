import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/money/**/*.test.ts', 'src/allocation/**/*.test.ts', 'src/tax/**/*.test.ts'],
  },
});
