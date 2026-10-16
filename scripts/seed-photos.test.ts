import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { businessDate, parseInstant } from '../packages/core/src/index.ts';
import { householdSeeds } from '../supabase/seed/generator/households.ts';
import { properties, PROPERTY_SEEDS } from '../supabase/seed/generator/properties.ts';
import { planPhotoUploads } from './seed-photos.ts';

const asOf = parseInstant('2026-10-07T09:00:00+07:00');
const today = businessDate(asOf, 'Asia/Ho_Chi_Minh');

function seededPaths(lanes: number): (string | null)[] {
  return householdSeeds(lanes).flatMap((household) =>
    properties.rows({ household, properties: PROPERTY_SEEDS, asOf, today }).map((row) => row['cover_photo_path'] as string | null),
  );
}

describe('planPhotoUploads', () => {
  it('uploads six photos per household, none for Kho Biên Hòa, each from a seed file', () => {
    const plan = planPhotoUploads(seededPaths(1));
    expect(plan).toHaveLength(12);
    expect(new Set(plan.map((upload) => upload.path.split('/')[0])).size).toBe(2);
    expect(plan.every((upload) => existsSync(upload.file) && upload.contentType === 'image/webp')).toBe(true);
    expect(seededPaths(1).filter((path) => path === null)).toHaveLength(2);
  });

  it('plans the same uploads on a second run', () => {
    expect(planPhotoUploads(seededPaths(1))).toEqual(planPhotoUploads(seededPaths(1)));
  });

  it('uploads a repeated path once and refuses a path outside the cover photo grammar', () => {
    const [path] = seededPaths(0);
    expect(planPhotoUploads([path ?? null, path ?? null, null])).toHaveLength(1);
    expect(() => planPhotoUploads(['demo/q7/nha-pho.webp'])).toThrow('not a cover photo path');
  });
});
