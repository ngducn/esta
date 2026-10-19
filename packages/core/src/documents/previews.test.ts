import { describe, expect, it } from 'vitest';
import { DOCUMENT_PREVIEWS, pdfPageScale, previewSize } from './previews';

describe('previewSize', () => {
  it('fits a portrait photo to the long side', () => {
    expect(previewSize(2000, 4000, DOCUMENT_PREVIEWS.thumb.longSide)).toEqual({ width: 160, height: 320 });
    expect(previewSize(3000, 2250, DOCUMENT_PREVIEWS.review.longSide)).toEqual({ width: 1024, height: 768 });
  });

  it('never enlarges a small page', () => {
    expect(previewSize(200, 100, DOCUMENT_PREVIEWS.review.longSide)).toEqual({ width: 200, height: 100 });
  });

  it('keeps a hair-thin page one pixel wide', () => {
    expect(previewSize(1, 5000, DOCUMENT_PREVIEWS.thumb.longSide)).toEqual({ width: 1, height: 320 });
  });
});

describe('pdfPageScale', () => {
  it('draws an A4 page with its long side at the review size', () => {
    const scale = pdfPageScale(595.28, 841.89);
    expect(Math.round(841.89 * scale)).toBe(DOCUMENT_PREVIEWS.review.longSide);
  });
});
