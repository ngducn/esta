import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROPERTY_KINDS, type PropertyKind } from '../properties/kinds';
import { COMPLETENESS_FACT_COLUMNS, completenessFactsRowSchema } from './facts';
import { COMPLETENESS_CHECKS } from './registry';
import { appliesTo } from './score';
import { SEED_FACTS } from './seed-facts.fixture';

const repoRoot = join(import.meta.dirname, '../../../..');
const applicable = (kind: PropertyKind) => COMPLETENESS_CHECKS.filter((check) => appliesTo(check, kind));
const ids = (kind: PropertyKind) => applicable(kind).map((check) => check.id);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('COMPLETENESS_CHECKS', () => {
  it('has unique ids', () => {
    const all = COMPLETENESS_CHECKS.map((check) => check.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(PROPERTY_KINDS)('gives %s a positive applicable weight', (kind) => {
    expect(applicable(kind).reduce((sum, check) => sum + check.weight, 0)).toBeGreaterThan(0);
  });

  it('skips the parcel checks for apartments and asks for floor area instead', () => {
    expect(ids('apartment')).not.toContain('parcelIds');
    expect(ids('apartment')).not.toContain('landArea');
    expect(ids('apartment')).toContain('floorArea');
    expect(ids('townhouse')).not.toContain('floorArea');
  });

  it('skips utility accounts for land (PRP-6)', () => {
    expect(ids('residential_land')).not.toContain('utilityAccounts');
    expect(ids('agricultural_land')).not.toContain('utilityAccounts');
    expect(ids('rooming_house')).toContain('utilityAccounts');
  });

  it('links each check to an id a page renders, so the tap lands on the field', () => {
    const web = sources(join(repoRoot, 'apps/web/src')).join('\n');
    const anchors = [...new Set(COMPLETENESS_CHECKS.map((check) => check.link(SEED_FACTS['long-an']).anchor))];
    expect(anchors.filter((anchor) => !new RegExp(`\\b(?:id|inputId|selectId)=["{']+${anchor}["}']`).test(web))).toEqual([]);
  });

  it('names a message for each check in both languages', () => {
    for (const locale of ['vi', 'en']) {
      const messages = JSON.parse(readFileSync(join(repoRoot, `apps/web/messages/${locale}.json`), 'utf8')) as { completeness: { checks: Record<string, string> } };
      expect(Object.keys(messages.completeness.checks).toSorted(), locale).toEqual(COMPLETENESS_CHECKS.map((check) => check.id).toSorted());
    }
  });
});

describe('COMPLETENESS_FACT_COLUMNS', () => {
  it('selects exactly the columns the row schema reads', () => {
    expect(COMPLETENESS_FACT_COLUMNS.split(', ')).toEqual(Object.keys(completenessFactsRowSchema.in.shape));
  });
});
