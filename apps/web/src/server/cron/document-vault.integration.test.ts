import { clockAt, parseInstant } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { localTarget, runSql } from '../../../../../scripts/export-source.ts';

// `pnpm test:integration` (scripts/web-integration.ts) runs this file alone, with the cron file: the sweep removes the
// strays of every household, and the vault search is checked here on the service client, which only cron code may hold. Writes a few documents and Storage files into the first household, and removes them after.
const url = z.url().parse(process.env.ESTA_IT_SUPABASE_URL);
const serviceRoleKey = z.string().min(1).parse(process.env.ESTA_IT_SERVICE_ROLE_KEY);
const SECRET = 'documents-integration-secret';

process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
const db: SupabaseClient<Database> = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-esta-actor': 'system:integration-test' } },
});
let household = '';

vi.mock('server-only', () => ({}));
vi.mock('@/server/env', () => ({ env: { CRON_SECRET: SECRET, NEXT_PUBLIC_SUPABASE_URL: url, ESTA_SIGNED_URL_TTL_SECONDS: 60 } }));
vi.mock('@/server/clock', () => ({
  readRequestClock: async () => clockAt({ kind: 'table', now: parseInstant('2026-10-07T09:00:00+07:00') }, 'Asia/Ho_Chi_Minh'),
}));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: household } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => db }));
vi.mock('@/server/documents/sign', () => ({ signDocumentUrls: async () => new Map() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

const { searchDocuments } = await import('../documents/search');
const sweepRoute = await import('@/app/api/cron/document-sweep/route');

const documentIds: string[] = [];
const uploaded: string[] = [];

async function addDocument(title: string, ocrText: string | null): Promise<string> {
  const id = randomUUID();
  const { error } = await db.from('documents').insert({
    id,
    household_id: household,
    category: 'other',
    title,
    storage_path: `${household}/${id}/tai-lieu.pdf`,
    mime: 'application/pdf',
    size_bytes: 100,
    sha256: 'f'.repeat(64),
    sensitivity: 'normal',
    ocr_text: ocrText,
  });
  if (error) throw new Error(error.message);
  documentIds.push(id);
  return id;
}

async function upload(folder: string): Promise<string> {
  const name = `${household}/${folder}/front.jpg`;
  const { error } = await db.storage.from('documents').upload(name, new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }));
  if (error) throw new Error(error.message);
  uploaded.push(name);
  return name;
}

const held = async (name: string) => {
  const { data, error } = await db.storage.from('documents').list(name.split('/').slice(0, 2).join('/'));
  if (error) throw new Error(error.message);
  return data.some((file) => file.name === 'front.jpg');
};

beforeAll(async () => {
  const { data, error } = await db.from('households').select('id').order('id').limit(1).single();
  if (error) throw new Error(error.message);
  household = data.id;
});

afterAll(async () => {
  if (documentIds.length > 0) await db.from('documents').delete().in('id', documentIds);
  if (uploaded.length > 0) await db.storage.from('documents').remove(uploaded);
});

const titles = async (query: string) => {
  const found = await searchDocuments(query);
  if (!found.ok) throw new Error(`search for "${query}" failed`);
  return found.tiles.map((tile) => tile.title).toSorted();
};

describe('the documents vault search against local Supabase (#151)', () => {
  it('finds a name or a figure typed the way it is printed, with dots, dashes and slashes', async () => {
    await addDocument('HĐ-12/2024 Demo', null);
    await addDocument('so.do.demo.pdf', 'Quận Q.7, TP.HCM, ngày 07/10/2026, phí 1.234.000 đồng');
    expect(await titles('HĐ-12/2024')).toEqual(['HĐ-12/2024 Demo']);
    expect(await titles('so.do.demo.pdf')).toEqual(['so.do.demo.pdf']);
    for (const typed of ['Q.7', 'TP.HCM', '07/10/2026', '1.234.000']) expect(await titles(typed), typed).toContain('so.do.demo.pdf');
  });

  it('finds the same document by the words of its name typed plainly', async () => {
    expect(await titles('hd 12 2024')).toContain('HĐ-12/2024 Demo');
  });
});

describe('the document sweep route against real Storage (#425)', () => {
  const authorized = new Request('http://localhost/api/cron/document-sweep', { headers: { authorization: `Bearer ${SECRET}` } });

  it('removes a file in a folder no row names once it is a day old, and leaves a young one and a registered one', async () => {
    const old = await upload(randomUUID());
    const young = await upload(randomUUID());
    const registeredId = await addDocument('Đã đăng ký Demo', null);
    const registered = await upload(registeredId);
    runSql(localTarget().dbUrl, `update storage.objects set created_at = now() - interval '3 days' where bucket_id = 'documents' and name in ('${old}', '${registered}')`);

    const response = await sweepRoute.GET(authorized);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(await held(old)).toBe(false);
    expect(await held(young)).toBe(true);
    expect(await held(registered)).toBe(true);
  });
});
