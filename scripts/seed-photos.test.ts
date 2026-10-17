import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { businessDate, parseInstant } from '../packages/core/src/index.ts';
import { householdSeeds } from '../supabase/seed/generator/households.ts';
import { properties, PROPERTY_SEEDS } from '../supabase/seed/generator/properties.ts';
import { planPhotoUploads, retrying } from './seed-photos.ts';

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
    expect(plan.every((upload) => existsSync(upload.file) && upload.contentType === 'image/avif')).toBe(true);
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

describe('retrying', () => {
  function server(...answers: (number | 'refused')[]) {
    const calls: number[] = [];
    const waits: number[] = [];
    const request = () => {
      const answer = answers[calls.push(calls.length) - 1] ?? 200;
      return answer === 'refused' ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(new Response(null, { status: answer }));
    };
    const wait = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    return { request, wait, calls, waits };
  }

  it('waits out the 502s Kong answers while Storage restarts after a reset', async () => {
    const storage = server(502, 'refused', 503, 200);
    const response = await retrying(storage.request, { attempts: 5, firstDelayMs: 250, wait: storage.wait });
    expect(response.status).toBe(200);
    expect(storage.waits).toEqual([250, 500, 1000]);
  });

  it('gives up after the last attempt and hands back the gateway error', async () => {
    const storage = server(502, 502, 502, 502);
    const response = await retrying(storage.request, { attempts: 3, firstDelayMs: 250, wait: storage.wait });
    expect(response.status).toBe(502);
    expect(storage.calls).toHaveLength(3);
  });

  it('returns any other answer at once, and rethrows a refused last attempt', async () => {
    const refusal = server(400);
    expect((await retrying(refusal.request, { attempts: 5, firstDelayMs: 250, wait: refusal.wait })).status).toBe(400);
    expect(refusal.waits).toEqual([]);
    const down = server('refused', 'refused');
    await expect(retrying(down.request, { attempts: 2, firstDelayMs: 250, wait: down.wait })).rejects.toThrow('fetch failed');
  });
});
