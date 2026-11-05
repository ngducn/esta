import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { EMPTY_STATES, emptyState, type EmptySurface, type Translate } from './empty-states';

const surfaces = Object.keys(EMPTY_STATES) as EmptySurface[];

const has = (messages: unknown, path: string) => path.split('.').reduce<unknown>((node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined), messages) !== undefined;

const keys = (surface: EmptySurface) => {
  const { ns, title, action, ...rest } = EMPTY_STATES[surface] as Record<string, unknown> & { ns: string; title: string; action: { label: string } };
  const named = [title, action.label, ...Object.values(rest).filter((value): value is string => typeof value === 'string')];
  return named.map((key) => `${ns}.${key}`);
};

describe('EMPTY_STATES', () => {
  test.each(surfaces)('%s names messages that exist in vi and en', (surface) => {
    for (const path of keys(surface)) {
      expect(has(vi, path), `vi ${path}`).toBe(true);
      expect(has(en, path), `en ${path}`).toBe(true);
    }
  });

  const echo: Translate = (key) => key;

  test.each(surfaces)('%s offers at most one action, and a viewer is offered none that edits', (surface) => {
    const member = emptyState(surface, echo, { canWrite: true, propertyId: 'p1' });
    const viewer = emptyState(surface, echo, { canWrite: false, propertyId: 'p1' });
    expect(member.action).toBeDefined();
    if (EMPTY_STATES[surface].action.write) expect(viewer.action).toBeUndefined();
    else expect(viewer.action).toEqual(member.action);
  });

  test('links point into the property they name', () => {
    expect(emptyState('propertyLegalParcels', echo, { canWrite: true, propertyId: 'p1' }).action?.href).toBe('/properties/p1/legal/parcels/new');
  });
});
