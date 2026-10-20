import { DOCUMENT_PREVIEWS, previewSize } from '@esta/core/documents/previews';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { importFolders } from './files';
import { localFiles } from './local-files';

const DEMO = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'connector-demo', 'Demo');
const files = localFiles(importFolders([DEMO]));
const read = async (name: string) => {
  const file = await files.readDocument(name);
  if (!file.ok) throw new Error(`${name} was refused: ${file.reason.problem}`);
  return file.value;
};

describe('local document files', () => {
  it('reads a photo and a PDF with their type from their bytes, their hash and their page count', async () => {
    const photo = await read('so-hong-demo-le-van-sy.jpg');
    const bytes = readFileSync(join(DEMO, 'so-hong-demo-le-van-sy.jpg'));
    expect(photo).toMatchObject({ name: 'so-hong-demo-le-van-sy.jpg', mime: 'image/jpeg', size: bytes.length, pageCount: 1 });
    expect(photo.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(await read('hop-dong-thue-demo-le-van-sy.pdf')).toMatchObject({ mime: 'application/pdf', pageCount: 2 });
  });

  it('refuses a spreadsheet as a document', async () => {
    expect(await files.readDocument('theo-doi-tai-san-demo.xlsx')).toEqual({ ok: false, reason: { kind: 'file', problem: 'unsupported_type' } });
  });

  it.each(['so-hong-demo-le-van-sy.jpg', 'hop-dong-thue-demo-le-van-sy.pdf'])('makes the WebP thumbnail and review copy the browser makes from %s, and keeps the file whole', async (name) => {
    const file = await read(name);
    const before = Buffer.from(file.bytes);
    const { thumb, review } = await files.previews(file);
    expect(Buffer.from(file.bytes).equals(before), 'drawing a PDF leaves the bytes to upload untouched').toBe(true);
    const [thumbInfo, reviewInfo] = await Promise.all([sharp(thumb).metadata(), sharp(review).metadata()]);
    expect([thumbInfo.format, reviewInfo.format]).toEqual(['webp', 'webp']);
    const page = file.mime === 'application/pdf' ? reviewInfo : await sharp(file.bytes).metadata();
    const upright = { width: page.width ?? 0, height: page.height ?? 0 };
    expect({ width: thumbInfo.width, height: thumbInfo.height }).toEqual(previewSize(upright.width, upright.height, DOCUMENT_PREVIEWS.thumb.longSide));
    expect({ width: reviewInfo.width, height: reviewInfo.height }).toEqual(previewSize(upright.width, upright.height, DOCUMENT_PREVIEWS.review.longSide));
    if (file.mime === 'application/pdf') expect(Math.max(upright.width, upright.height), 'page 1 is drawn at the review size').toBe(DOCUMENT_PREVIEWS.review.longSide);
  });
});
