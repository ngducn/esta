import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_IDS } from './categories';

const repoRoot = join(import.meta.dirname, '../../../..');
const SPEC_CATEGORIES = /- `documents`:.*?category \(`([^`]+)`\)/.exec(readFileSync(join(repoRoot, 'docs/spec/SPEC.md'), 'utf8'))?.[1]?.split(' | ') ?? [];

describe('DOCUMENT_CATEGORIES', () => {
  it('has exactly the SPEC §5.5 categories', () => {
    expect(SPEC_CATEGORIES.length).toBe(13);
    expect(DOCUMENT_CATEGORY_IDS.toSorted()).toEqual(SPEC_CATEGORIES.toSorted());
  });

  it('defaults only certificates and ID cards to sensitive (DOC-5)', () => {
    expect(DOCUMENT_CATEGORY_IDS.filter((id) => DOCUMENT_CATEGORIES[id].sensitivity === 'sensitive').toSorted()).toEqual(['certificate', 'id_card']);
  });

  it('names an extraction schema only where one exists, leaving lease contracts to P3-19', () => {
    expect(DOCUMENT_CATEGORY_IDS.filter((id) => DOCUMENT_CATEGORIES[id].extractionSchema !== null).map((id) => [id, DOCUMENT_CATEGORIES[id].extractionSchema])).toEqual([
      ['certificate', 'certificate_v1'],
      ['utility_bill', 'utility_bill_v1'],
    ]);
  });

  it('names each category in both languages', () => {
    for (const locale of ['vi', 'en']) {
      const messages = JSON.parse(readFileSync(join(repoRoot, `apps/web/messages/${locale}.json`), 'utf8')) as { documents: { category: string } };
      for (const id of DOCUMENT_CATEGORY_IDS) expect(messages.documents.category, `${locale} ${id}`).toContain(` ${id} {`);
    }
  });
});
