import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CommonRefusal } from './kit';
import { change, defineOp, refuse, runOp, settle, unchanged, type OpContext } from './op';

const ctx = {} as OpContext;

/** A row store with one unique name, so a second writer can race the plan the way a real insert would. */
function nameOp(stored: Map<string, string>, raceOnApply: string | null = null) {
  return defineOp<{ id: string; name: string }, { id: string; name: string }, { id: string }, { kind: 'name_taken' }>({
    creates: 'properties',
    input: z.object({ id: z.string(), name: z.string().min(1) }),
    async plan(_ctx, input) {
      if (stored.get(input.id) === input.name) return unchanged({ id: input.id });
      if ([...stored.values()].includes(input.name)) return refuse({ kind: 'name_taken' });
      return change(input);
    },
    async apply(_ctx, row) {
      if (raceOnApply !== null) stored.set(raceOnApply, row.name);
      if ([...stored.values()].includes(row.name)) return refuse<CommonRefusal>({ kind: 'conflict' });
      stored.set(row.id, row.name);
      return { ok: true, value: { id: row.id } };
    },
  });
}

describe('runOp', () => {
  it('parses, plans and applies, and planning again after it landed says unchanged', async () => {
    const stored = new Map<string, string>();
    const op = nameOp(stored);
    expect(await runOp(op, ctx, { id: 'a', name: 'Demo' })).toEqual({ ok: true, value: { id: 'a' } });
    expect(await op.plan(ctx, { id: 'a', name: 'Demo' })).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: 'a' } } });
    expect(await runOp(op, ctx, { id: 'a', name: 'Demo' })).toEqual({ ok: true, value: { id: 'a' } });
  });

  it('refuses input that does not parse with paths and codes', async () => {
    expect(await runOp(nameOp(new Map()), ctx, { id: 'a', name: '' })).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'name', code: 'too_small' }] } });
  });

  it("explains a conflict at apply by planning again, so a racing writer's name reads as taken", async () => {
    const result = await runOp(nameOp(new Map(), 'b'), ctx, { id: 'a', name: 'Demo' });
    expect(result).toEqual({ ok: false, reason: { kind: 'name_taken' } });
  });
});

describe('settle', () => {
  it('lets the caller veto the fresh change before anything is written', async () => {
    const stored = new Map<string, string>();
    const result = await settle(nameOp(stored), ctx, { id: 'a', name: 'Demo' }, (fresh) => (fresh.name === 'Demo' ? { kind: 'stale' } : null));
    expect(result).toEqual({ ok: false, reason: { kind: 'stale' } });
    expect(stored.size).toBe(0);
  });
});
