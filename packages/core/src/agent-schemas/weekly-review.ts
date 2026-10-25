import { z } from 'zod';
import { factHandleSchema, watchNoteSchema } from './portfolio-watch';

export const MAX_WEEKLY_PROPOSALS = 3;

/**
 * What the weekly review's `create_item` takes: one title line, a Markdown body that links records by handle as
 * `[text](f2)`, and the handles of the records it covers, whose links the note keeps beside the ones in its body.
 */
export const weeklyNoteSchema = watchNoteSchema.extend({ related: z.array(factHandleSchema).max(30) });

export type WeeklyNote = z.infer<typeof weeklyNoteSchema>;
