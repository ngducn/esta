import { describe, expect, it } from 'vitest';
import { ownersFromHolders } from './owners-from-holders';

const party = (n: number, fullName: string, idLast4: string | null) => ({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, fullName, idLast4 });
const me = party(1, 'Nguyễn Thị Demo', '1234');
const father = party(2, 'Trần Văn Demo', '5678');
const ryan = party(3, 'Trần Minh Demo', '9012');
const holder = ({ fullName, idLast4 }: { fullName: string; idLast4: string | null }) => ({ fullName, idLast4 });
const share = (party_id: string, share_bp: number) => ({ party_id, share_bp, named_on_certificate: true, since: null });

describe('ownersFromHolders (PRP-3)', () => {
  it('gives one holder the whole 10000 bp', () => {
    expect(ownersFromHolders([holder(me)], [me, father], [])).toEqual([share(me.id, 10_000)]);
  });

  it('splits a married couple 5000 and 5000, both named on the certificate', () => {
    expect(ownersFromHolders([holder(father), holder(me)], [me, father], [])).toEqual([share(father.id, 5000), share(me.id, 5000)]);
  });

  it('puts the remainder of three holders on the first: 3334, 3333 and 3333', () => {
    const shares = ownersFromHolders([holder(me), holder(father), holder(ryan)], [ryan, father, me], []);
    expect(shares).toEqual([share(me.id, 3334), share(father.id, 3333), share(ryan.id, 3333)]);
    expect(shares.reduce((sum, row) => sum + row.share_bp, 0)).toBe(10_000);
  });

  it('matches an existing party by name and id_last4, whatever the case and spacing of the printed name', () => {
    const sameNameOtherId = party(4, 'Nguyễn Thị Demo', '0000');
    expect(ownersFromHolders([{ fullName: 'NGUYỄN  THỊ DEMO', idLast4: '1234' }], [sameNameOtherId, me], [])).toEqual([share(me.id, 10_000)]);
  });

  it('leaves out a holder with no matching party and counts one party once', () => {
    expect(ownersFromHolders([holder(me), { fullName: 'Lê Văn Demo', idLast4: '4444' }, holder(me)], [me], [])).toEqual([share(me.id, 10_000)]);
    expect(ownersFromHolders([], [me], [])).toEqual([]);
  });

  it('matches a holder printed without ID digits to the party saved without them', () => {
    const noId = party(5, 'Phạm Thị Demo', null);
    expect(ownersFromHolders([{ fullName: 'Phạm Thị Demo', idLast4: null }], [noId], [])).toEqual([share(noId.id, 10_000)]);
  });

  it('gives the share to the party the review linked, not an older party with the same name and no ID digits', () => {
    const older = party(6, 'Phạm Thị Demo', null);
    const linked = party(7, 'Phạm Thị Demo', null);
    expect(ownersFromHolders([{ fullName: 'Phạm Thị Demo', idLast4: null }, holder(me)], [older, me, linked], [linked.id, me.id])).toEqual([
      share(linked.id, 5000),
      share(me.id, 5000),
    ]);
  });

  it('leaves out a holder whose name and ID digits fit two parties when the certificate links none', () => {
    const one = party(6, 'Phạm Thị Demo', null);
    const other = party(7, 'Phạm Thị Demo', null);
    expect(ownersFromHolders([{ fullName: 'Phạm Thị Demo', idLast4: null }, holder(me)], [one, other, me], [])).toEqual([share(me.id, 10_000)]);
  });
});
