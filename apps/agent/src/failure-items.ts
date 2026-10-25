import type { Clock } from '@esta/core';
import type { Locale } from '@esta/core/format';
import type { TablesInsert } from '@esta/db';
import type { AgentJob, JobSpec } from './jobs/registry';
import type { Failure } from './sdk/result';
import type { AgentDb } from './supabase';
import { householdLocale } from './tools/household-info';

const AUTH_ITEM = {
  vi: {
    title: 'Trợ lý không đăng nhập được vào Claude',
    body: 'Claude từ chối đăng nhập của máy chạy Trợ lý, nên các việc của Trợ lý không chạy được. Kiểm tra mã đăng nhập trên máy đó, khởi động lại Trợ lý, rồi bấm Thử lại.',
  },
  en: {
    title: 'The assistant could not sign in to Claude',
    body: "Claude refused the sign-in of the machine that runs the assistant, so its jobs cannot run. Check the sign-in token on that machine, restart the assistant, then tap Retry.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

type Binding = { readonly db: AgentDb; readonly job: AgentJob; readonly spec: JobSpec | undefined; readonly clock: Clock };

async function upsertItem(db: AgentDb, item: TablesInsert<'agent_items'>): Promise<void> {
  const { error } = await db.from('agent_items').upsert(item, { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true });
  if (error) throw new Error(`Writing the failure item failed: ${error.message}`);
}

/**
 * After a job's last attempt (AGENT.md §9): a kind with a `failedTitle` leaves one item with Thử lại for admins, and a
 * rejected login leaves operators one note a day that says so. Neither shows the error text, which only operators read
 * on the job. Both are keyed, so a worker that dies after writing them and fails the job again adds nothing.
 */
export async function writeFailureItems({ db, job, spec, clock }: Binding, failure: Failure): Promise<void> {
  const retryable = spec?.failedTitle;
  if (retryable === undefined && failure.kind !== 'auth_error') return;
  const locale = await householdLocale(db, job.household_id);
  const base = { household_id: job.household_id, severity: 'info', job_id: job.id, created_at: clock.now() } as const;
  if (retryable !== undefined) {
    // A note the number guard held back is the operator's alone (AGENT.md §9), and so is its retry.
    const audience = failure.kind === 'number_guard' ? 'operator' : 'all';
    await upsertItem(db, { ...base, kind: 'alert', audience, title: retryable[locale], proposal: { type: 'retry_job', params: { job_id: job.id }, min_role: 'admin' }, dedupe_key: `job_failed:${job.id}` });
  }
  if (failure.kind === 'auth_error') {
    await upsertItem(db, { ...base, kind: 'system', severity: 'action', audience: 'operator', title: AUTH_ITEM[locale].title, body_md: AUTH_ITEM[locale].body, dedupe_key: `auth_error:${clock.today()}` });
  }
}
