import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

// Runs the worker in this process, so the pid a caller records is the worker's own and `kill <pid>` stops it.
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(join(import.meta.dirname, '..'), slot, { app: 'agent' });
Object.assign(process.env, env);
console.error(`ESTA_SLOT=${slot} api=${env.SUPABASE_URL} agent mode=${env.ESTA_AGENT_MODE ?? 'live'}`);
await import('../apps/agent/src/main.ts');
