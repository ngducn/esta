import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import ts from 'typescript';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { MAX_LONG_SIDE } from './downscale';

/** downscaleForPdf needs createImageBitmap, canvas and JPEG encoding, which only a real browser has. */
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><title>downscale</title>');
  const source = ts.transpileModule(readFileSync(new URL('./downscale.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await page.addScriptTag({ type: 'module', content: `${source}\nwindow.downscaleForPdf = downscaleForPdf;` });
  await page.waitForFunction(() => 'downscaleForPdf' in window);
}, 30_000);

afterAll(() => browser?.close());

type Result = { width: number; height: number; type: string; blobWidth: number; blobHeight: number; top: number[]; bottom: number[] };

async function downscale(jpeg: Buffer): Promise<Result> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const run = (window as unknown as { downscaleForPdf: (blob: Blob) => Promise<{ blob: Blob; width: number; height: number }> }).downscaleForPdf;
    const { blob, width, height } = await run(new Blob([bytes], { type: 'image/jpeg' }));
    const bitmap = await createImageBitmap(blob);
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    context?.drawImage(bitmap, 0, 0);
    const pixel = (y: number) => Array.from(context?.getImageData(Math.floor(bitmap.width / 2), y, 1, 1).data ?? []).slice(0, 3);
    return { width, height, type: blob.type, blobWidth: bitmap.width, blobHeight: bitmap.height, top: pixel(10), bottom: pixel(bitmap.height - 10) };
  }, jpeg.toString('base64'));
}

/** Red on its left half and blue on its right, so after a quarter turn red is on top. */
async function halves(width: number, height: number) {
  const half = (r: number, b: number) => sharp({ create: { width: width / 2, height, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite([
    { input: await half(255, 0), left: 0, top: 0 },
    { input: await half(0, 255), left: width / 2, top: 0 },
  ]);
}

test('a photo tagged EXIF orientation 6 comes out upright, red on top and blue at the bottom', async () => {
  const jpeg = await (await halves(400, 200)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await downscale(jpeg);
  expect(result).toMatchObject({ width: 200, height: 400, blobWidth: 200, blobHeight: 400, type: 'image/jpeg' });
  const [topRed, , topBlue] = result.top;
  const [bottomRed, , bottomBlue] = result.bottom;
  expect(topRed, 'red on top, as the page stands').toBeGreaterThan(200);
  expect(topBlue).toBeLessThan(60);
  expect(bottomBlue, 'blue at the bottom').toBeGreaterThan(200);
  expect(bottomRed).toBeLessThan(60);
}, 30_000);

test('a 12 MP photo comes out with its long side at 2000 px, re-encoded as JPEG', async () => {
  const jpeg = await (await halves(4000, 3000)).jpeg().toBuffer();
  const result = await downscale(jpeg);
  expect(result).toMatchObject({ width: MAX_LONG_SIDE, height: 1500, blobWidth: MAX_LONG_SIDE, blobHeight: 1500, type: 'image/jpeg' });
}, 30_000);

test('a photo already under the cap keeps its size', async () => {
  const jpeg = await (await halves(1200, 900)).jpeg().toBuffer();
  expect(await downscale(jpeg)).toMatchObject({ width: 1200, height: 900, blobWidth: 1200, blobHeight: 900 });
}, 30_000);
