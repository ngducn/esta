import { join } from 'node:path';
import { parseSlot, slotPorts } from './slot.ts';
import { slotEnv } from './slot-env.ts';

// Runs the worker in this process, so the pid a caller records is the worker's own and `kill <pid>` stops it.
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(join(import.meta.dirname, '..'), slot, { app: 'agent' });
// Notices are off unless asked for, so a worker that only runs jobs never mails a lane's Inbucket mailbox beside a sign-in code.
const notices = process.env.ESTA_NOTIFY === 'on' ? { SMTP_URL: `smtp://127.0.0.1:${slotPorts(slot).smtp}`, ESTA_APP_URL: `http://127.0.0.1:${slotPorts(slot).web}` } : {};
Object.assign(process.env, env, notices);
console.error(`ESTA_SLOT=${slot} api=${env.SUPABASE_URL} agent mode=${env.ESTA_AGENT_MODE ?? 'live'}`);
await import('../apps/agent/src/main.ts');
