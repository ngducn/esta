/**
 * The dedupe key of the Thử lại item a job leaves after its last attempt (AGENT.md §9). It names the job's kind and the
 * day or week it ran for, so Thị trường can say that today's news scan failed instead of showing a quiet day, and a
 * scan for yesterday that fails for good after midnight is not today's (#329).
 */
export function failedJobKey(kind: string, period: string, jobId: string): string {
  return `job_failed:${kind}:${period}:${jobId}`;
}
