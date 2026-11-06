import { relative, sep } from 'node:path';
import { z } from 'zod';

const reportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      message: z.string().default(''),
      assertionResults: z.array(z.object({ fullName: z.string(), status: z.string(), failureMessages: z.array(z.string()).default([]) })),
    }),
  ),
});

export type VitestReport = z.infer<typeof reportSchema>;

export const parseReport = (json: string): VitestReport => reportSchema.parse(JSON.parse(json));

/** The local Supabase gateway answering while its upstream restarts or is busy (#310). Anything else is a real failure. */
export const GATEWAY_ERROR = /An invalid response was received from the upstream server/;

/**
 * The files to run once more when every failure in the report is the gateway error, and `undefined` when any failure is
 * something else: one real failure beside a gateway error must not be retried into a pass.
 */
export function gatewayRetryFiles(report: VitestReport, webRoot: string): string[] | undefined {
  const files: string[] = [];
  for (const file of report.testResults) {
    const failures = [...file.assertionResults.filter((test) => test.status === 'failed').flatMap((test) => test.failureMessages), ...(file.status === 'failed' && file.assertionResults.every((test) => test.status !== 'failed') ? [file.message] : [])];
    if (failures.length === 0) continue;
    if (!failures.every((message) => GATEWAY_ERROR.test(message))) return undefined;
    files.push(relative(webRoot, file.name).split(sep).join('/'));
  }
  return files.length > 0 ? files : undefined;
}
