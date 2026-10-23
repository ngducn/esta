import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../packages/core/src/date/iso-date.ts';
import { readValuation } from '../packages/core/src/valuations/schema.ts';

const migration = readFileSync(join(import.meta.dirname, '..', 'supabase', 'migrations', '20261007406000_valuations.sql'), 'utf8');
const [, pattern = '', ceiling = ''] = migration.match(/source_url ~ '([^']+)' and char_length\(source_url\) <= (\d+)/) ?? [];
const sqlAccepts = (text: string) => new RegExp(pattern.replaceAll('[:space:]', '\\s')).test(text) && text.length <= Number(ceiling);

const prefixes = ['https://', 'HTTPS://', 'Https://', 'hTtPs://', 'https:', 'https:/', 'https:\\\\', 'https:///', ' https://', 'http://', 'javascript:'];
const rests = ['example.com', 'Example.COM/Bao-Gia', 'ví-dụ.vn/báo giá', 'example.com/ x', 'example.com/\tx', '[::1]/x', 'example.com:443/a?b=c d#e', `example.com/${'đ'.repeat(330)}`, 'x'.repeat(1990)];

describe('the source link CHECK in 20261007406000_valuations.sql', () => {
  it('is the https pattern and length the test reads', () => {
    expect([pattern, ceiling]).toEqual(['^https://[^[:space:]]+$', '2000']);
  });

  it('accepts every link the valuation sheet accepts', () => {
    const accepted = prefixes.flatMap((prefix) =>
      rests.flatMap((rest) => {
        const read = readValuation({ id: '6f1c2b8e-9a4d-4c3e-8f7a-1b2c3d4e5f60', propertyId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', method: 'comparables', value: '9ty5', sourceUrl: prefix + rest }, isoDate('2026-10-07'));
        return read.ok && read.value.sourceUrl !== null ? [read.value.sourceUrl] : [];
      }),
    );
    expect(accepted.length).toBeGreaterThan(30);
    expect(accepted.filter((href) => !sqlAccepts(href))).toEqual([]);
  });
});
