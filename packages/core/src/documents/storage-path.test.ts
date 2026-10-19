import { describe, expect, it } from 'vitest';
import { DOCUMENT_OBJECT_NAME, documentObjectName, reviewPath, storagePath, thumbBlurPath, thumbPath } from './storage-path';

const household = '0b8c1a52-7f0e-5c1e-9a4b-3d2f1e0c9b8a';
const document = '5e2d6c4b-1a3f-5e7d-8c9b-0a1b2c3d4e5f';

describe('storagePath', () => {
  it('slugs a Vietnamese name to ASCII inside the document folder', () => {
    expect(storagePath(household, document, 'Sổ hồng Bảo Lộc (bản sao).jpg')).toBe(`${household}/${document}/so-hong-bao-loc-ban-sao.jpg`);
  });

  it('folds decomposed input the same as composed', () => {
    expect(documentObjectName('Sổ hồng.JPG'.normalize('NFD'))).toBe('so-hong.jpg');
    expect(documentObjectName('Đất Đồng Nai.pdf')).toBe('dat-dong-nai.pdf');
  });

  it('keeps a 300-character name to 100 characters with its extension', () => {
    const name = documentObjectName(`${'Hợp đồng thuê '.repeat(22)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(name).toMatch(DOCUMENT_OBJECT_NAME);
  });

  it('accepts a name without an extension', () => {
    expect(documentObjectName('scan')).toBe('scan');
    expect(documentObjectName('.')).toBe('tai-lieu');
    expect(documentObjectName('Ảnh')).toMatch(DOCUMENT_OBJECT_NAME);
  });

  it('never names the file like a copy made from it', () => {
    expect(documentObjectName('thumb.webp')).toBe('file-thumb.webp');
    expect(documentObjectName('Thumb Blur.webp')).toBe('file-thumb-blur.webp');
    expect(documentObjectName('Review.WEBP')).toBe('file-review.webp');
  });

  it('puts both thumbnails and the review copy beside the file', () => {
    expect(thumbPath(household, document)).toBe(`${household}/${document}/thumb.webp`);
    expect(thumbBlurPath(household, document)).toBe(`${household}/${document}/thumb-blur.webp`);
    expect(reviewPath(household, document)).toBe(`${household}/${document}/review.webp`);
    expect(reviewPath(household, document).split('/')[2]).toMatch(DOCUMENT_OBJECT_NAME);
  });
});
