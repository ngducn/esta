import { describe, expect, it } from 'vitest';
import { ownershipShareSchema, ownershipSharesSchema } from './ownership';

const me = '6f9619ff-8b86-4011-b42d-00c04fc964ff';
const ryan = '7f9619ff-8b86-4011-b42d-00c04fc964ff';
const share = (party_id: string, share_bp: number) => ({ party_id, share_bp, named_on_certificate: true, since: null });

describe('ownershipShareSchema', () => {
  it('parses a share with a since date', () => {
    expect(ownershipShareSchema.parse({ ...share(me, 5000), since: '2019-11-20' })).toEqual({ ...share(me, 5000), since: '2019-11-20' });
  });

  it.each([
    ['share_bp 0', share(me, 0)],
    ['share_bp 10001', share(me, 10001)],
    ['a fractional share_bp', share(me, 33.33)],
    ['a party that is not a uuid', share('me', 5000)],
    ['an impossible date', { ...share(me, 5000), since: '2026-02-30' }],
    ['an unknown key', { ...share(me, 5000), percent: 50 }],
  ])('refuses %s', (_, value) => {
    expect(ownershipShareSchema.safeParse(value).success).toBe(false);
  });
});

describe('ownershipSharesSchema', () => {
  it('keeps an incomplete set and an empty one', () => {
    expect(ownershipSharesSchema.parse([share(me, 6000), share(ryan, 3000)])).toHaveLength(2);
    expect(ownershipSharesSchema.parse([])).toEqual([]);
  });

  it('refuses the same party twice, whatever the case of its id', () => {
    expect(ownershipSharesSchema.safeParse([share(me, 5000), share(me.toUpperCase(), 5000)]).success).toBe(false);
  });
});
