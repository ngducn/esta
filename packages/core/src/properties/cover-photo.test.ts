import { describe, expect, it } from 'vitest';
import { coverPhotoPath, parseCoverPhotoPath, stalePhotos } from './cover-photo';

const household = '1f0e6a52-5b0c-5d7e-9a51-0c2b3e4f5a6b';
const property = '7c1d2e3f-4a5b-5c6d-8e7f-901a2b3c4d5e';

describe('coverPhotoPath', () => {
  it('round-trips through parseCoverPhotoPath', () => {
    const path = coverPhotoPath(household, property, 'nha-pho.webp');
    expect(path).toEqual({ ok: true, value: `${household}/${property}/nha-pho.webp` });
    expect(path.ok && parseCoverPhotoPath(path.value)).toEqual({ householdId: household, propertyId: property, name: 'nha-pho.webp' });
  });

  it.each(['cover.avif', 'cover.jpg', 'cover.jpeg', 'cover.png', 'a'.repeat(64) + '.webp'])('accepts %s', (name) => {
    expect(coverPhotoPath(household, property, name).ok).toBe(true);
  });

  it.each([
    ['upper case', 'Cover.webp'],
    ['a space', 'nha pho.webp'],
    ['a parent segment', '../cover.webp'],
    ['a gif', 'cover.gif'],
    ['no extension', 'cover'],
    ['a 65 character stem', 'a'.repeat(65) + '.webp'],
    ['a slash', 'x/cover.webp'],
  ])('refuses a name with %s', (_, name) => {
    expect(coverPhotoPath(household, property, name)).toEqual({ ok: false, reason: 'name' });
  });

  it('refuses ids that are not lower-case uuids', () => {
    expect(coverPhotoPath('demo', property, 'cover.webp')).toEqual({ ok: false, reason: 'household_id' });
    expect(coverPhotoPath(household, property.toUpperCase(), 'cover.webp')).toEqual({ ok: false, reason: 'property_id' });
  });
});

describe('parseCoverPhotoPath', () => {
  it.each([
    ['two segments', `${household}/cover.webp`],
    ['four segments', `${household}/${property}/x/cover.webp`],
    ['a leading slash', `/${household}/${property}/cover.webp`],
    ['a bad name', `${household}/${property}/Cover.webp`],
  ])('returns null for %s', (_, path) => {
    expect(parseCoverPhotoPath(path)).toBeNull();
  });
});

describe('stalePhotos', () => {
  const at = (path: string, createdAt: string) => ({ path, createdAt });
  const old = at('h/p/old.webp', '2026-10-17T10:00:00.000Z');
  const mine = at('h/p/mine.webp', '2026-10-17T10:05:00.000Z');
  const theirs = at('h/p/theirs.webp', '2026-10-17T10:06:00.000Z');

  it('removes what is older than the new cover and keeps the new cover', () => {
    expect(stalePhotos([old, mine], { anchor: mine.path, inclusive: false, current: mine.path })).toEqual([old.path]);
  });

  it('never removes a newer upload another editor is still saving', () => {
    expect(stalePhotos([old, mine, theirs], { anchor: mine.path, inclusive: false, current: mine.path })).toEqual([old.path]);
  });

  it('never removes the object the row points to, even when it is older', () => {
    expect(stalePhotos([old, mine], { anchor: mine.path, inclusive: false, current: old.path })).toEqual([]);
    expect(stalePhotos([old, mine], { anchor: mine.path, inclusive: true, current: old.path })).toEqual([mine.path]);
  });

  it('removes the removed cover itself and what came before it', () => {
    expect(stalePhotos([old, mine, theirs], { anchor: mine.path, inclusive: true, current: null })).toEqual([old.path, mine.path]);
  });

  it('removes nothing when the anchor is not in the folder', () => {
    expect(stalePhotos([old, mine], { anchor: 'h/p/gone.webp', inclusive: true, current: null })).toEqual([]);
  });
});
