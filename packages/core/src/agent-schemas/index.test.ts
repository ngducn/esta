import { describe, expect, it } from 'vitest';
import { DOCUMENT_CATEGORIES } from '../documents/categories';
import { REQUIRED_FIELDS } from '../extraction/required-fields';
import { AGENT_SCHEMAS, isAgentSchemaName } from './index';

describe('AGENT_SCHEMAS', () => {
  it('holds every schema a document category extracts with', () => {
    const named = Object.values(DOCUMENT_CATEGORIES).flatMap((spec) => (spec.extractionSchema === null ? [] : [spec.extractionSchema]));
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(isAgentSchemaName(name), name).toBe(true);
  });

  it('reads a lease contract with lease_v1 (P3-19)', () => {
    expect(DOCUMENT_CATEGORIES.lease_contract.extractionSchema).toBe('lease_v1');
    expect(isAgentSchemaName('lease_v1')).toBe(true);
  });

  it('scores every schema on its required fields', () => {
    expect(Object.keys(REQUIRED_FIELDS).toSorted()).toEqual(Object.keys(AGENT_SCHEMAS).toSorted());
  });
});
