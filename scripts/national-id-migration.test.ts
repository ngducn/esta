import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nationalIdMigrationPath, renderNationalIdMigration } from './national-id-migration.ts';

describe('national ID migration', () => {
  it('the committed migration is the generator output (run pnpm exec tsx scripts/national-id-migration.ts)', () => {
    expect(readFileSync(nationalIdMigrationPath, 'utf8')).toBe(renderNationalIdMigration());
  }, 15_000);
});
