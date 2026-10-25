import { describe, expect, it } from 'vitest';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { refuseProduction, resolveSeedKeys } from './agent-propose.ts';

describe('agent:propose', () => {
  it('refuses production and runs anywhere else', () => {
    expect(refuseProduction('production')).toMatch(/Refusing/);
    for (const env of [undefined, 'development', 'test']) expect(refuseProduction(env)).toBeNull();
  });

  it('turns seed keys in the fixture into the household’s ids and leaves other text alone', () => {
    expect(resolveSeedKeys({ title: 'Gọi {{f1.place_label}}', property_id: 'seed:property:{household}:di-an', nested: ['seed:lease:{household}:di-an:5', 3, null] }, 'lane-1')).toEqual({
      title: 'Gọi {{f1.place_label}}',
      property_id: seedId('seed:property:lane-1:di-an'),
      nested: [seedId('seed:lease:lane-1:di-an:5'), 3, null],
    });
  });
});
