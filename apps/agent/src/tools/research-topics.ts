import { deriveResearchTopics, type ResearchTopic } from '@esta/core/research';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';
import { adminUnitNames, readHeldProperties } from './list-properties';

/** The household's topics from its properties as they stand, under current and pre-2025 names (AGENT.md §5.2). */
async function deriveTopics(db: AgentDb, householdId: string): Promise<ResearchTopic[]> {
  const held = (await readHeldProperties(db, householdId)).flatMap(({ id, kind, communeCode, provinceCode }) => (communeCode === null || provinceCode === null ? [] : [{ id, kind, communeCode, provinceCode }]));
  const communes = [...new Set(held.map((property) => property.communeCode))];
  const [names, legacy] = await Promise.all([
    adminUnitNames(db, [...communes, ...held.map((property) => property.provinceCode)]),
    communes.length === 0 ? { data: [], error: null } : db.from('admin_unit_legacy_map').select('new_commune_code, old_province_name, old_district_name, merge_kind').in('new_commune_code', communes).order('id'),
  ]);
  if (legacy.error) throw new Error(`Reading the legacy units failed: ${legacy.error.message}`);
  const units = legacy.data.map((row) => ({ newCommuneCode: row.new_commune_code, oldProvinceName: row.old_province_name, oldDistrictName: row.old_district_name, whole: row.merge_kind === 'whole' }));
  return deriveResearchTopics(held, names, units);
}

/**
 * Brings `research_topics` in line with the portfolio before the scan: one upsert by topic key, then the automatic
 * topics of properties the household no longer holds turn inactive. Both statements converge, so a rerun is a no-op.
 */
export async function syncResearchTopics(db: AgentDb, householdId: string): Promise<void> {
  const topics = await deriveTopics(db, householdId);
  const upsert = await db.from('research_topics').upsert(
    topics.map((topic) => ({
      household_id: householdId,
      topic_key: topic.key,
      label: topic.label,
      query_templates: [...topic.query_templates],
      province_codes: [...topic.province_codes],
      property_ids: [...topic.property_ids],
      source: topic.source,
      active: true,
    })),
    { onConflict: 'household_id,topic_key' },
  );
  if (upsert.error) throw new Error(`Saving the research topics failed: ${upsert.error.message}`);
  const { data, error } = await db.from('research_topics').select('topic_key').eq('household_id', householdId).eq('source', 'auto').eq('active', true);
  if (error) throw new Error(`Reading the research topics failed: ${error.message}`);
  const current = new Set(topics.map((topic) => topic.key));
  const stale = data.map((row) => row.topic_key).filter((key) => !current.has(key));
  if (stale.length === 0) return;
  const retire = await db.from('research_topics').update({ active: false }).eq('household_id', householdId).in('topic_key', stale);
  if (retire.error) throw new Error(`Retiring the research topics failed: ${retire.error.message}`);
}

export type TopicRecord = { readonly topic_label: string; readonly query_templates: readonly string[]; readonly province_codes: readonly string[] };

/** `research_topics`: the household's active topics as citable records. A second call answers the same records. */
export function researchTopicsTool(db: AgentDb, householdId: string, cite: RunSheet['cite']) {
  const records = new Map<string, CitedRecord<TopicRecord>>();
  let listed: Array<CitedRecord<TopicRecord>> | undefined;
  return {
    records: records as ReadonlyMap<string, CitedRecord<TopicRecord>>,
    wasRead: () => listed !== undefined,
    async run() {
      if (listed === undefined) {
        const { data, error } = await db.from('research_topics').select('label, query_templates, province_codes').eq('household_id', householdId).eq('active', true).order('topic_key');
        if (error) throw new Error(`research_topics failed: ${error.message}`);
        listed = data.map((row) => {
          const record = cite({ topic_label: row.label, query_templates: row.query_templates, province_codes: row.province_codes });
          records.set(record.handle, record);
          return record;
        });
      }
      return { topics: listed };
    },
  };
}
