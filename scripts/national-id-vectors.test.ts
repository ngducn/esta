import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NATIONAL_ID_REPLAYED, NATIONAL_ID_VECTORS } from '../packages/core/src/agent-schemas/national-id-vectors.ts';
import { holds, nationalIdTestPath, renderNationalIdTest } from './national-id-vectors.ts';

describe('national ID vectors', () => {
  it('the pgTAP test holds the current vectors (run pnpm exec tsx scripts/national-id-vectors.ts)', () => {
    expect(readFileSync(nationalIdTestPath, 'utf8')).toBe(renderNationalIdTest());
  });

  it('the pgTAP test replays every row core replays, so no row is read by one side only', () => {
    const sql = readFileSync(nationalIdTestPath, 'utf8');
    const rows = [...NATIONAL_ID_REPLAYED.reduced, ...NATIONAL_ID_REPLAYED.kept, ...NATIONAL_ID_VECTORS.squeezed, ...NATIONAL_ID_VECTORS.refused];
    const missing = rows.filter(([, text]) => !sql.includes(holds(text ?? ''))).map(([name]) => name);
    expect(missing).toEqual([]);
  });
});
