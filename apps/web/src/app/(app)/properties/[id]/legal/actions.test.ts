import { describe, expect, test, vi } from 'vitest';

const PROPERTY = '00000000-0000-4000-8000-0000000000b0';
const CERTIFICATE = '00000000-0000-4000-8000-0000000000c1';

const db = vi.hoisted(() => ({ writes: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ role: 'member', household: { id: '0943e55d-b0a6-5aef-839d-07c8693c520e' } }) }));
vi.mock('@/server/supabase/server', () => ({
  createSessionClient: async () => {
    const saved = Promise.resolve({ data: { id: CERTIFICATE }, error: null });
    const builder = { eq: () => builder, select: () => builder, single: () => saved, maybeSingle: () => saved };
    return {
      from: () => ({
        insert: () => {
          db.writes.push('insert');
          return builder;
        },
        update: () => {
          db.writes.push('update');
          return builder;
        },
      }),
    };
  },
}));

const { saveLegalItem } = await import('./actions');

const blank = {
  form: 'gcn_2009_2024',
  serial_no: '',
  book_entry_no: '',
  issued_on: null,
  issued_by: 'Sở Tài nguyên và Môi trường tỉnh Lâm Đồng',
  holder_party_ids: [],
  status: 'valid',
  mortgage: null,
  annotations: [],
};

describe('saveLegalItem on a certificate (#356)', () => {
  test('a new certificate and an edit with no serial, book entry, issue date or holder are refused before any write', async () => {
    db.writes = [];
    expect(await saveLegalItem(PROPERTY, 'certificates', null, blank)).toEqual({ ok: false, reason: 'invalid' });
    expect(await saveLegalItem(PROPERTY, 'certificates', CERTIFICATE, blank)).toEqual({ ok: false, reason: 'invalid' });
    expect(db.writes).toEqual([]);
  });

  test('a certificate with a serial number is inserted, and edited', async () => {
    db.writes = [];
    const filled = { ...blank, serial_no: 'AB 123456' };
    expect(await saveLegalItem(PROPERTY, 'certificates', null, filled)).toEqual({ ok: true, id: CERTIFICATE });
    expect(await saveLegalItem(PROPERTY, 'certificates', CERTIFICATE, filled)).toEqual({ ok: true, id: CERTIFICATE });
    expect(db.writes).toEqual(['insert', 'update']);
  });
});
