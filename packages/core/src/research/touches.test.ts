import { describe, expect, it } from 'vitest';
import { researchTouches } from './touches';

const DI_AN = { id: 'di-an', provinceCode: '79' };

describe('researchTouches', () => {
  it('matches an item that names the property or its province, and nothing else', () => {
    expect(researchTouches({ relatedPropertyIds: ['di-an'], provinceCodes: [] }, DI_AN)).toBe(true);
    expect(researchTouches({ relatedPropertyIds: [], provinceCodes: ['79'] }, DI_AN)).toBe(true);
    expect(researchTouches({ relatedPropertyIds: ['bien-hoa'], provinceCodes: ['75'] }, DI_AN)).toBe(false);
    expect(researchTouches({ relatedPropertyIds: [], provinceCodes: ['79'] }, { id: 'x', provinceCode: null })).toBe(false);
  });
});
