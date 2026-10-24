import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../guard';

/** One handle a tool returned in this run (AGENT.md §6.3). */
export const factHandleSchema = z.string().regex(/^f[1-9]\d*$/, 'a handle such as f1');

/**
 * One note `create_item` writes for portfolio_watch: a one-line plain-text title, a Markdown body and the watch facts it
 * covers, by handle. The tool sets its kind, severity, audience and dedupe key from those facts.
 */
export const watchNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200).regex(/^[^\r\n]*$/, 'one line'),
    body_md: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
    related: z.array(factHandleSchema).min(1).max(30),
  })
  .strict();

export type WatchNote = z.infer<typeof watchNoteSchema>;
