import { z } from 'zod';

export const answerStatusSchema = z.enum(['streaming', 'done', 'error']);
export type AnswerStatus = z.infer<typeof answerStatusSchema>;

/** An answer as its page shows it: the guarded text so far and the record links its run looked up (`messages.refs`). */
export const answerStateSchema = z.object({ content: z.string(), status: answerStatusSchema, refs: z.array(z.string()).readonly() }).readonly();
export type AnswerState = z.infer<typeof answerStateSchema>;

/** One server-sent event of `/api/answers/{id}`. */
export const answerEventSchema = z.union([answerStateSchema, z.object({ status: z.enum(['timeout', 'gone']) })]);
export type AnswerEvent = z.infer<typeof answerEventSchema>;
