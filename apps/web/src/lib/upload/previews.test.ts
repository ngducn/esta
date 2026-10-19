import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import ts from 'typescript';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { REVIEW_SIZE, THUMB_SIZE } from './previews';

/** makePreviews needs createImageBitmap, canvas and WebP encoding, which only a real browser has. */
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><title>previews</title>');
  const source = ts.transpileModule(readFileSync(new URL('./previews.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await page.addScriptTag({ type: 'module', content: `${source}\nwindow.makePreviews = makePreviews;` });
  await page.waitForFunction(() => 'makePreviews' in window);
}, 30_000);

afterAll(() => browser?.close());

/** A 4000x2000 JPEG, red on its left and blue on its right, tagged EXIF orientation 6: upright it is 2000x4000, red on top. */
async function rotatedPhoto(): Promise<string> {
  const half = (r: number, b: number) => sharp({ create: { width: 2000, height: 2000, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: await half(255, 0), left: 0, top: 0 },
      { input: await half(0, 255), left: 2000, top: 0 },
    ])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return jpeg.toString('base64');
}

test('an EXIF-rotated photo comes out upright as a 320 px thumbnail, a blurred variant that differs, and a 1600 px review copy', async () => {
  const result = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    type Made = { thumb: Blob; blurred: Blob; review: Blob };
    const make = (window as unknown as { makePreviews: (file: Blob) => Promise<Made> }).makePreviews;
    const { thumb, blurred, review } = await make(new Blob([bytes], { type: 'image/jpeg' }));
    const read = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      context?.drawImage(bitmap, 0, 0);
      const pixel = (y: number) => Array.from(context?.getImageData(Math.floor(bitmap.width / 2), y, 1, 1).data ?? []).slice(0, 3);
      return { width: bitmap.width, height: bitmap.height, top: pixel(10), bottom: pixel(bitmap.height - 10), type: blob.type };
    };
    const same = new Uint8Array(await thumb.arrayBuffer()).join() === new Uint8Array(await blurred.arrayBuffer()).join();
    return { thumb: await read(thumb), review: await read(review), same };
  }, await rotatedPhoto());

  expect(result.same, 'the blurred thumbnail differs from the clear one').toBe(false);
  expect(result.thumb).toMatchObject({ width: THUMB_SIZE / 2, height: THUMB_SIZE, type: 'image/webp' });
  expect(result.review).toMatchObject({ width: REVIEW_SIZE / 2, height: REVIEW_SIZE, type: 'image/webp' });
  for (const image of [result.thumb, result.review]) {
    const [topRed, , topBlue] = image.top;
    const [bottomRed, , bottomBlue] = image.bottom;
    expect(topRed, 'red on top, as the photo stands').toBeGreaterThan(200);
    expect(topBlue).toBeLessThan(60);
    expect(bottomBlue, 'blue at the bottom').toBeGreaterThan(200);
    expect(bottomRed).toBeLessThan(60);
  }
}, 30_000);
