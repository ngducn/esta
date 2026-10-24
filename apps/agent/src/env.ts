import { assertClockAllowed } from '@esta/core';
import { z } from 'zod';

const text = z.string().trim().min(1).optional();

export const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required by the worker'),
  ESTA_AGENT_MODE: z.enum(['live', 'replay']).default('live'),
  ESTA_AUTH_MODE: z.enum(['subscription', 'api_key']).default('subscription'),
  CLAUDE_CODE_OAUTH_TOKEN: text,
  ANTHROPIC_API_KEY: text,
  ESTA_MODEL_ROUTINE: text,
  ESTA_AGENT_HOME: text,
  ESTA_REPLAY_DIR: text,
  ESTA_ENV: z.enum(['development', 'test', 'preview', 'production']).optional(),
  ESTA_FROZEN_NOW: text,
  ESTA_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  /** `off` leaves the daily jobs unqueued, for e2e workers that must not race a spec's own job rows. */
  ESTA_AGENT_SCHEDULE: z.enum(['on', 'off']).default('on'),
});

export type AgentEnv = z.infer<typeof envSchema>;

/** `.env.example` ships every name with an empty value, and an empty value means unset. */
export function parseAgentEnv(raw: Readonly<Record<string, string | undefined>>): AgentEnv {
  const set = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value.trim() !== ''));
  return envSchema.parse(set);
}

export type Credential = { readonly name: 'CLAUDE_CODE_OAUTH_TOKEN' | 'ANTHROPIC_API_KEY'; readonly value: string };

export type RunMode =
  | { readonly agentMode: 'replay'; readonly authMode: 'none' }
  | {
      readonly agentMode: 'live';
      readonly authMode: AgentEnv['ESTA_AUTH_MODE'];
      readonly credential: Credential;
      readonly model: string;
    };

const CREDENTIAL_FOR = { subscription: 'CLAUDE_CODE_OAUTH_TOKEN', api_key: 'ANTHROPIC_API_KEY' } as const;

/** Replay reads no credential, so CI starts the worker without secrets (AGENT.md §2.3). */
export function assertStartAllowed(env: AgentEnv): RunMode {
  assertClockAllowed(env);
  if (env.ESTA_AGENT_MODE === 'replay') return { agentMode: 'replay', authMode: 'none' };
  // A live worker that defaulted to development would read test_clock and ESTA_FROZEN_NOW in production.
  if (env.ESTA_ENV === undefined) {
    throw new Error('Refusing to start: ESTA_AGENT_MODE=live needs an explicit ESTA_ENV, which is not set');
  }
  const name = CREDENTIAL_FOR[env.ESTA_AUTH_MODE];
  const value = env[name];
  if (value === undefined) {
    throw new Error(`Refusing to start: ESTA_AGENT_MODE=live with ESTA_AUTH_MODE=${env.ESTA_AUTH_MODE} needs ${name}, which is not set`);
  }
  if (env.ESTA_MODEL_ROUTINE === undefined) {
    throw new Error('Refusing to start: ESTA_AGENT_MODE=live needs ESTA_MODEL_ROUTINE, which is not set');
  }
  return { agentMode: 'live', authMode: env.ESTA_AUTH_MODE, credential: { name, value }, model: env.ESTA_MODEL_ROUTINE };
}
