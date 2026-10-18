import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import ts from 'typescript';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { THUMB_SIZE } from './thumbnail';

/** makeThumbnails needs createImageBitmap, canvas and WebP encoding, which only a real browser has. */
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><title>thumbnail</title>');
  const source = ts.transpileModule(readFileSync(new URL('./thumbnail.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await page.addScriptTag({ type: 'module', content: `${source}\nwindow.makeThumbnails = makeThumbnails;` });
  await page.waitForFunction(() => 'makeThumbnails' in window);
}, 30_000);

afterAll(() => browser?.close());

/** A 400x200 JPEG, red on its left and blue on its right, tagged EXIF orientation 6: shown upright it is 200x400, red on top. */
async function rotatedPhoto(): Promise<string> {
  const half = (r: number, b: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: await half(255, 0), left: 0, top: 0 },
      { input: await half(0, 255), left: 200, top: 0 },
    ])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return jpeg.toString('base64');
}

test('an EXIF-rotated photo comes out upright, its long side at 320 px, with a blurred variant that differs', async () => {
  const result = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const make = (window as unknown as { makeThumbnails: (file: Blob) => Promise<{ thumb: Blob; blurred: Blob }> }).makeThumbnails;
    const { thumb, blurred } = await make(new Blob([bytes], { type: 'image/jpeg' }));
    const bitmap = await createImageBitmap(thumb);
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    context?.drawImage(bitmap, 0, 0);
    const pixel = (y: number) => Array.from(context?.getImageData(Math.floor(bitmap.width / 2), y, 1, 1).data ?? []).slice(0, 3);
    const same = new Uint8Array(await thumb.arrayBuffer()).join() === new Uint8Array(await blurred.arrayBuffer()).join();
    return { width: bitmap.width, height: bitmap.height, top: pixel(10), bottom: pixel(bitmap.height - 10), type: thumb.type, same };
  }, await rotatedPhoto());

  expect(result).toMatchObject({ width: THUMB_SIZE / 2, height: THUMB_SIZE, type: 'image/webp', same: false });
  const [topRed, , topBlue] = result.top;
  const [bottomRed, , bottomBlue] = result.bottom;
  expect(topRed, 'red on top, as the photo stands').toBeGreaterThan(200);
  expect(topBlue).toBeLessThan(60);
  expect(bottomBlue, 'blue at the bottom').toBeGreaterThan(200);
  expect(bottomRed).toBeLessThan(60);
}, 30_000);
