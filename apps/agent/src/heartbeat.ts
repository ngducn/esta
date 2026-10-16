import type { Clock } from '@esta/core';
import type { TablesInsert } from '@esta/db';
import type { AgentDb } from './supabase';

export const HEARTBEAT_INTERVAL_MS = 60_000;

/** The page reads only the newest row, which a beating worker has just written, so older rows are stopped workers. */
const HEARTBEAT_RETENTION_MS = 24 * 60 * 60_000;

export type HeartbeatInfo = Omit<TablesInsert<'worker_heartbeats'>, 'last_seen_at'>;

export async function beat(db: AgentDb, info: HeartbeatInfo, clock: Clock): Promise<void> {
  const now = clock.now();
  const { error } = await db.from('worker_heartbeats').upsert({ ...info, last_seen_at: now });
  if (error) throw new Error(`Writing the heartbeat failed: ${error.message}`);
  const cutoff = new Date(Date.parse(now) - HEARTBEAT_RETENTION_MS).toISOString();
  const pruned = await db.from('worker_heartbeats').delete().lt('last_seen_at', cutoff);
  if (pruned.error) throw new Error(`Pruning old heartbeats failed: ${pruned.error.message}`);
}

export function startHeartbeat(db: AgentDb, info: HeartbeatInfo, clock: () => Promise<Clock>, onError: (error: unknown) => void): () => void {
  const tick = () => {
    clock()
      .then((current) => beat(db, info, current))
      .catch(onError);
  };
  tick();
  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
