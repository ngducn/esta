import { z } from 'zod';

/** A trimmed single line of text, as a title or a brief line is. */
export const oneLine = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\r\n]*$/, 'one line');

/** Whitespace-separated words, the measure AGENT.md uses for the brief and research summaries. */
export const wordCount = (text: string): number => text.split(/\s+/u).filter(Boolean).length;
