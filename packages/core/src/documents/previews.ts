/**
 * The two copies made from page 1 of every document, by the browser's `makePreviews` and by the connector on Ryan's
 * Mac, so a vault card looks the same whichever way its file came in. A thumbnail for the card and a review copy that
 * the review screen shows until Mẹ zooms in, each WebP at a quality out of 100. This module imports nothing, so a test
 * can load it into a bare page.
 */
export const DOCUMENT_PREVIEWS = {
  thumb: { longSide: 320, quality: 70 },
  review: { longSide: 1024, quality: 75 },
} as const;

export const PREVIEW_MIME = 'image/webp';

/** A page scaled to fit the long side, never enlarged. */
export function previewSize(width: number, height: number, longSide: number): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A PDF's page 1 is drawn with its long side at the review size; both copies are then made from that drawing. */
export function pdfPageScale(width: number, height: number): number {
  return DOCUMENT_PREVIEWS.review.longSide / Math.max(width, height);
}
