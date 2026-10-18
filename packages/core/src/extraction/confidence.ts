import type { ReviewField } from './fields';
import { HIGH_CONFIDENCE } from './score';

/** The AGENT.md §7.2 high-confidence line: a value read with less than this is marked `kiểm tra lại`. */
export const REVIEW_CONFIDENCE_THRESHOLD = HIGH_CONFIDENCE;

/** A field Mẹ should check against the image. A manual entry has nothing read, so nothing to check. */
export function needsCheck(field: Pick<ReviewField, 'leaf'>): boolean {
  return field.leaf !== null && field.leaf.confidence < REVIEW_CONFIDENCE_THRESHOLD;
}
