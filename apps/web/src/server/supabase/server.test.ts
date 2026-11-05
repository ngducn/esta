import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ estaEnv: 'test', fault: 'reads' as string | undefined }));
const createServerClient = vi.hoisted(() => vi.fn(() => ({})));

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined, get: (name: string) => (name === 'esta_fault' && state.fault !== undefined ? { value: state.fault } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('@/server/env', () => ({
  env: {
    get ESTA_ENV() {
      return state.estaEnv;
    },
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));

const { createSessionClient } = await import('./server');

const options = () => (createServerClient.mock.calls.at(-1) as unknown as [string, string, { global?: { fetch: typeof fetch } }])[2];

describe('the esta_fault cookie', () => {
  beforeEach(() => {
    createServerClient.mockClear();
    state.fault = 'reads';
  });

  it('makes the requester’s own reads fail outside production', async () => {
    state.estaEnv = 'test';
    await createSessionClient();
    const failing = options().global?.fetch;
    expect(failing).toBeDefined();
    await expect(failing?.('http://127.0.0.1:54321/rest/v1/properties?select=id')).rejects.toThrow('fetch failed');
  });

  it('is ignored in production, so a visitor cannot make reads fail', async () => {
    state.estaEnv = 'production';
    await createSessionClient();
    expect(options().global).toBeUndefined();
  });

  it('does nothing without the cookie', async () => {
    state.estaEnv = 'test';
    state.fault = undefined;
    await createSessionClient();
    expect(options().global).toBeUndefined();
  });
});
