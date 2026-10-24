import { businessDate, parseInstant } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import type { AgentDb } from '../supabase';
import type { RunSheet } from './fact-sheet';

const KINDS = ['alert', 'research_scan_empty'];

/** `recent_items`: the notes Trợ lý already left the household today, each a citable record; a second call answers the same records. */
export function recentItemsTool(binding: { readonly db: AgentDb; readonly householdId: string; readonly asOf: IsoDate; readonly timezone: string }, cite: RunSheet['cite']) {
  let items: unknown[] | undefined;
  return async () => {
    if (items === undefined) {
      const { data, error } = await binding.db
        .from('agent_items')
        .select('kind, severity, title, created_at')
        .eq('household_id', binding.householdId)
        .eq('audience', 'all')
        .in('kind', KINDS)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(`recent_items failed: ${error.message}`);
      items = data
        .filter((row) => businessDate(parseInstant(row.created_at), binding.timezone) === binding.asOf)
        .map((row) => cite({ kind: row.kind, severity: row.severity, title_label: row.title }));
    }
    return { items };
  };
}
