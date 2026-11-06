import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { carryDepositsToRenewals, renewedBy } from './deposits';

const chain = [
  { id: 'a', renewalOfLeaseId: null },
  { id: 'b', renewalOfLeaseId: 'a' },
  { id: 'c', renewalOfLeaseId: 'b' },
  { id: 'z', renewalOfLeaseId: null },
];

describe('one reading of which lease renewed which (#308)', () => {
  it('names the renewing lease of every lease that has one', () => {
    expect([...renewedBy(chain)]).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('moves a deposit to the end of the chain the same links define', () => {
    const carried = carryDepositsToRenewals(chain, new Map([['a', vnd(5_000_000)], ['z', vnd(1_000_000)]]));
    expect([...carried]).toEqual([
      ['c', 5_000_000],
      ['z', 1_000_000],
    ]);
  });

  it('stops at a loop instead of following it for ever', () => {
    const loop = [{ id: 'a', renewalOfLeaseId: 'b' }, { id: 'b', renewalOfLeaseId: 'a' }];
    expect(carryDepositsToRenewals(loop, new Map([['a', vnd(1)]])).size).toBe(1);
  });
});
