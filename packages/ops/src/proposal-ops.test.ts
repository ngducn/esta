import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { proposalApprove } from './proposal-ops';
import { fakeDb, opContext as context, PROPERTY, type Sent } from './test/fake-db';

const ITEM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0a20';
const TASK = { type: 'create_task', params: { title: 'Gọi người thuê Phòng 5', due_on: '2026-10-07', property_id: PROPERTY, lease_id: null } };

const holding = (status: string, proposal: unknown = TASK) => (sent: Sent) => (sent.table === 'agent_items' ? [{ status, proposal }] : []);
const rpcs = (sent: readonly Sent[]) => sent.filter((request) => request.table.startsWith('rpc/'));

describe('proposalApprove', () => {
  it('plans the approval with the registry verdict on the stored params', async () => {
    expect(await proposalApprove.plan(context(fakeDb(holding('new')).db), { id: ITEM })).toEqual({ ok: true, value: { kind: 'change', change: { id: ITEM, paramsValid: true } } });
    expect(await proposalApprove.plan(context(fakeDb(holding('read', { type: 'create_task', params: { title: '' } })).db), { id: ITEM })).toEqual({
      ok: true,
      value: { kind: 'change', change: { id: ITEM, paramsValid: false } },
    });
    expect(await proposalApprove.plan(context(fakeDb(holding('new', { type: 'sell_property', params: {} })).db), { id: ITEM })).toEqual({
      ok: true,
      value: { kind: 'change', change: { id: ITEM, paramsValid: false } },
    });
  });

  it.each(['approved', 'failed'] as const)('answers what was decided when the proposal is already %s, and calls nothing', async (status) => {
    const { db, sent } = fakeDb(holding(status));
    expect(await runOp(proposalApprove, context(db), { id: ITEM })).toEqual({ ok: true, value: { id: ITEM, status } });
    expect(rpcs(sent)).toEqual([]);
  });

  it('refuses a dismissed proposal and one it cannot see', async () => {
    expect(await runOp(proposalApprove, context(fakeDb(holding('dismissed')).db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'dismissed' } });
    expect(await runOp(proposalApprove, context(fakeDb().db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('reads only proposals of the household', async () => {
    const { db, sent } = fakeDb(holding('new'));
    await proposalApprove.plan(context(db), { id: ITEM });
    expect(sent[0]?.query.get('kind')).toBe('eq.proposal');
    expect(sent[0]?.query.get('household_id')).toMatch(/^eq\./);
  });

  it("sends the approval to approve_proposal and maps the function's refusals", async () => {
    const failing = (error: { code: string; message: string }) => fakeDb(holding('new'), (sent) => (sent.table.startsWith('rpc/') ? error : null));
    const viewer = failing({ code: 'P0002', message: 'ESTA_PROPOSAL_NOT_FOUND' });
    expect(await runOp(proposalApprove, context(viewer.db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'not_found' } });
    expect(rpcs(viewer.sent)).toMatchObject([{ method: 'POST', table: 'rpc/approve_proposal', body: { p_item_id: ITEM, p_params_valid: true } }]);
    expect(await runOp(proposalApprove, context(failing({ code: '55000', message: 'ESTA_PROPOSAL_DECIDED' }).db), { id: ITEM })).toEqual({ ok: false, reason: { kind: 'dismissed' } });
  });
});
