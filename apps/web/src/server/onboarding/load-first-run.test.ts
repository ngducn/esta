import { beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { readonly data?: unknown; readonly count?: number | null; readonly error?: { readonly message: string } | null };
type Table = 'properties' | 'bank_accounts' | 'household_members' | 'household_settings';

const stack = vi.hoisted(() => ({ replies: {} as Partial<Record<string, Reply>>, throwOn: null as string | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/server/supabase/server', () => ({
  createSessionClient: async () => ({
    from(table: string) {
      const read = async () => {
        if (stack.throwOn === table) throw new Error('network');
        const reply = stack.replies[table] ?? {};
        return { data: reply.data ?? null, count: reply.count === undefined ? null : reply.count, error: reply.error ?? null };
      };
      const builder: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject) };
      for (const method of ['select', 'eq', 'is', 'maybeSingle']) builder[method] = () => builder;
      return builder;
    },
  }),
}));

const { loadFirstRun } = await import('./load-first-run');

const good: Record<Table, Reply> = {
  properties: { count: 0 },
  bank_accounts: { count: 1 },
  household_members: { count: 2 },
  household_settings: { data: { onboarding: {} } },
};
const failure = { message: 'boom' };

beforeEach(() => {
  stack.replies = structuredClone(good);
  stack.throwOn = null;
});

describe('loadFirstRun', () => {
  it('states the steps from four good reads', async () => {
    const state = await loadFirstRun('household', 'admin');
    expect(state?.visible).toBe(true);
    expect(state?.steps.map((step) => [step.id, step.done])).toEqual([
      ['add-property', false],
      ['add-bank-account', true],
      ['invite-member', true],
    ]);
  });

  it.each(['properties', 'bank_accounts', 'household_members', 'household_settings'] as const)('returns null when the %s read fails', async (table) => {
    stack.replies[table] = { ...good[table], error: failure };
    expect(await loadFirstRun('household', 'admin')).toBeNull();
  });

  it.each(['properties', 'bank_accounts', 'household_members'] as const)('returns null when the %s count is null', async (table) => {
    stack.replies[table] = { count: null };
    expect(await loadFirstRun('household', 'admin')).toBeNull();
  });

  it.each(['properties', 'bank_accounts', 'household_members', 'household_settings'] as const)('returns null when the %s call throws', async (table) => {
    stack.throwOn = table;
    expect(await loadFirstRun('household', 'admin')).toBeNull();
  });

  it('returns null when the settings row is missing or has a bad shape', async () => {
    stack.replies.household_settings = { data: null };
    expect(await loadFirstRun('household', 'admin')).toBeNull();
    for (const data of [{ onboarding: 'x' }, { onboarding: { dismissed_at: 5 } }, {}]) {
      stack.replies.household_settings = { data };
      expect(await loadFirstRun('household', 'admin')).toBeNull();
    }
  });

  it('reads nothing for a member', async () => {
    expect(await loadFirstRun('household', 'member')).toBeNull();
  });
});
