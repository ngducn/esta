import { remainingWebCaps, type WebCaps } from '@esta/core/agent-limits';
import type { AgentDb } from '../supabase';

/** `caps` less the searches and fetches this job's earlier attempts made, so a retry cannot start with a fresh budget (#327). */
export async function capsLeftForJob(db: AgentDb, jobId: string, caps: WebCaps): Promise<WebCaps> {
  const { data, error } = await db.from('agent_runs').select('tool_calls').eq('job_id', jobId);
  if (error) throw new Error(`Reading the job's earlier runs failed: ${error.message}`);
  const spent: Record<string, number> = {};
  for (const { tool_calls } of data) {
    const counts = typeof tool_calls === 'object' && tool_calls !== null && !Array.isArray(tool_calls) ? tool_calls : {};
    for (const tool of ['WebSearch', 'WebFetch'] as const) spent[tool] = (spent[tool] ?? 0) + (typeof counts[tool] === 'number' ? counts[tool] : 0);
  }
  return remainingWebCaps(caps, spent);
}
