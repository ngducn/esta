/**
 * The dedupe key of the Thử lại item a job leaves after its last attempt (AGENT.md §9). It names the job's kind, so
 * Thị trường can say that today's news scan failed instead of showing a quiet day (#329).
 */
export function failedJobKey(kind: string, jobId: string): string {
  return `job_failed:${kind}:${jobId}`;
}
