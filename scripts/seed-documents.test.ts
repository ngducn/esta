import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, generate } from '../supabase/seed/generator/index.ts';
import { planDocumentUploads } from './seed-documents.ts';

const storagePaths = (lanes: number) =>
  [...generate({ ...DEFAULT_OPTIONS, lanes }).matchAll(/'([0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.(?:jpg|png|pdf))'/g)].map((match) => match[1] ?? '');

describe('planDocumentUploads', () => {
  it('uploads every seeded file with its two thumbnails and its review copy for two households', () => {
    const paths = storagePaths(1);
    expect(paths).toHaveLength(18);
    const plan = planDocumentUploads(paths);
    expect(plan).toHaveLength(72);
    expect(plan.filter((upload) => upload.kind === 'review').map((upload) => upload.path.split('/')[2])).toEqual(Array(18).fill('review.webp'));
    expect(plan.filter((upload) => upload.kind === 'file').map((upload) => upload.path).toSorted()).toEqual(paths.toSorted());
    expect(plan.filter((upload) => upload.kind !== 'file').every((upload) => upload.contentType === 'image/webp')).toBe(true);
    expect(new Set(plan.map((upload) => upload.path)).size).toBe(plan.length);
  });

  it('plans the same uploads on a second run, whatever order the rows come back in', () => {
    const paths = storagePaths(1);
    expect(planDocumentUploads(paths.toReversed())).toEqual(planDocumentUploads(paths));
  });

  it('skips a document uploaded through the app', () => {
    expect(planDocumentUploads(['0b8c1a52-7f0e-5c1e-9a4b-3d2f1e0c9b8a/5e2d6c4b-1a3f-5e7d-8c9b-0a1b2c3d4e5f/so-hong.jpg'])).toEqual([]);
  });
});
