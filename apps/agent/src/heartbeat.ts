import type { Clock } from '@esta/core';
import type { TablesInsert } from '@esta/db';
import type { AgentDb } from './supabase';

export const HEARTBEAT_INTERVAL_MS = 60_000;

export type HeartbeatInfo = Omit<TablesInsert<'worker_heartbeats'>, 'last_seen_at'>;

export async function beat(db: AgentDb, info: HeartbeatInfo, clock: Clock): Promise<void> {
  const { error } = await db.from('worker_heartbeats').upsert({ ...info, last_seen_at: clock.now() });
  if (error) throw new Error(`Writing the heartbeat failed: ${error.message}`);
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
