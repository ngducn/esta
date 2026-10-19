import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { applyPlan, propertyCreate, propertyEdit, readClock, runOp, type Db } from '@esta/ops';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEMO_PASSWORD } from '../../../supabase/seed/generator/households.ts';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { logIn } from './login';
import { connectorClient } from './session';
import { fileStore } from './store';
import { stdioConnector } from './test/stdio';

// `pnpm --filter @esta/connector test:integration` (scripts/connector-integration.ts) passes the slot's stack; run
// against a fresh `pnpm db:reset`. The server starts exactly as the README tells Claude Code to start it.
const env = z.object({ ESTA_SLOT: z.string(), ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1) }).parse(process.env);
const ROOT = join(import.meta.dirname, '..', '..', '..');
const OPERATOR = 'ryan.lane9@demo.esta.test';
const MEMBER = 'me.lane9@demo.esta.test';
const property = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);

const sessionFiles: string[] = [];
const sessionFile = () => {
  const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-it-')), 'session.json');
  sessionFiles.push(file);
  return file;
};
const storeAt = (file: string) => fileStore(env.ESTA_IT_SUPABASE_URL, file);
const clientAt = (file: string) => connectorClient({ ESTA_SUPABASE_URL: env.ESTA_IT_SUPABASE_URL, ESTA_SUPABASE_ANON_KEY: env.ESTA_IT_ANON_KEY }, storeAt(file));

function signIn(email: string, file: string) {
  return logIn(clientAt(file), { email, password: DEMO_PASSWORD });
}

afterAll(async () => {
  for (const file of sessionFiles) {
    if (storeAt(file).getItem('session') !== null) expect((await clientAt(file).auth.signOut({ scope: 'local' })).error).toBeNull();
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

async function startConnector(file: string) {
  const connector = stdioConnector({ command: 'pnpm', args: ['--silent', '--dir', ROOT, 'connector'], env: { ESTA_SLOT: env.ESTA_SLOT, ESTA_SESSION_FILE: file } });
  await connector.connect();
  return connector;
}

type Connector = Awaited<ReturnType<typeof startConnector>>;

async function call(connector: Connector, name: string, args: Record<string, unknown> = {}) {
  const result = await connector.client.callTool({ name, arguments: args });
  const text = z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(result.content)[0]?.text ?? '';
  return { isError: result.isError === true, text, json: (): unknown => JSON.parse(text) };
}

function setClock(instant: string) {
  expect(spawnSync('pnpm', ['--silent', 'clock:set', instant], { cwd: ROOT, env: { ...process.env, ESTA_SLOT: env.ESTA_SLOT } }).status).toBe(0);
}

/** The session client, except that a query filtered to `id` throws, as a dropped connection does mid-batch. */
function droppingQueriesOn(db: Db, id: string): Db {
  const dropping = <T extends object>(query: T): T =>
    new Proxy(query, {
      get(target, key) {
        const member: unknown = Reflect.get(target, key);
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          if (key === 'eq' && args[1] === id) throw new Error('connection dropped');
          const next: unknown = member.apply(target, args);
          return typeof next === 'object' && next !== null && !(next instanceof Promise) ? dropping(next) : next;
        };
      },
    });
  return dropping(db);
}

const candidatesSchema = z.object({ candidates: z.array(z.object({ id: z.string(), nickname: z.string(), code: z.string(), address: z.string().nullable(), reasons: z.array(z.string()) })) });

describe('the connector over stdio, signed in as the household operator', () => {
  const file = sessionFile();
  let connector: Connector;

  beforeAll(async () => {
    const signedIn = await signIn(OPERATOR, file);
    expect(signedIn).toMatchObject({ ok: true, value: { householdName: 'Gia đình Demo 9' } });
    connector = await startConnector(file);
  }, 60_000);

  afterAll(async () => {
    await connector.client.close();
  });

  it('keeps the session in a file only its owner can read', () => {
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('offers the four read tools and the two that change properties', async () => {
    const { tools } = await connector.client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(['apply_plan', 'find_property', 'get_property', 'list_properties', 'plan_changes', 'resolve_address']);
  });

  it("lists the household's properties and no other household's", async () => {
    const listed = z.object({ properties: z.array(z.object({ id: z.string(), nickname: z.string() })) }).parse((await call(connector, 'list_properties')).json()).properties;
    const ids = listed.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([property(9, 'bao-loc'), property(9, 'q7'), property(9, 'di-an')]));
    expect(ids).not.toContain(property(8, 'bao-loc'));
  });

  it('shows an amount in the kind details beside its display string', async () => {
    const { kindDetails } = z.object({ kindDetails: z.record(z.string(), z.unknown()) }).parse((await call(connector, 'get_property', { id: property(9, 'thu-duc') })).json());
    expect(kindDetails).toMatchObject({ management_fee_vnd: 1_200_000, management_fee_vnd_display: formatVnd(vnd(1_200_000), 'vi') });
  });

  it('finds a property by nickname without diacritics, and by its exact code first', async () => {
    const byName = candidatesSchema.parse((await call(connector, 'find_property', { text: 'bao loc' })).json()).candidates;
    expect(byName[0]).toEqual({ id: property(9, 'bao-loc'), nickname: 'Đất Bảo Lộc', code: 'BAOLOC', address: expect.any(String), reasons: ['nickname'] });
    const byCode = candidatesSchema.parse((await call(connector, 'find_property', { text: 'dian' })).json()).candidates;
    expect(byCode[0]).toMatchObject({ id: property(9, 'di-an'), reasons: ['code'] });
  });

  it("reads one property, and refuses another household's property as not found", async () => {
    const own = z.object({ id: z.string(), nickname: z.string(), unitCount: z.number() }).parse((await call(connector, 'get_property', { id: property(9, 'di-an') })).json());
    expect(own).toMatchObject({ nickname: 'Dãy trọ Dĩ An', unitCount: 8 });
    const foreign = await call(connector, 'get_property', { id: property(8, 'di-an') });
    expect(foreign).toMatchObject({ isError: true, text: '{"error":"not_found"}' });
  });

  it('maps "Dĩ An, Bình Dương" to its current ward under TP. Hồ Chí Minh (PRP-4)', async () => {
    const { suggestions } = z.object({ suggestions: z.array(z.object({ provinceCode: z.string(), matchedLegacyName: z.string() })) }).parse((await call(connector, 'resolve_address', { text: 'Dĩ An, Bình Dương' })).json());
    expect(suggestions[0]?.provinceCode).toBe('79');
  });

  it('logs tool names and counts to stderr, never what the tools returned', () => {
    const log = connector.stderr();
    expect(log).toContain('[connector] find_property count=');
    expect(log).toContain('[connector] list_properties count=');
    expect(log).not.toContain('Bảo Lộc');
    expect(log).not.toContain('refresh_token');
  });
});

describe('the connector for anyone but the operator', () => {
  it('signs a member who is not the operator out again at sign-in, leaving no session behind', async () => {
    const file = sessionFile();
    expect(await signIn(MEMBER, file)).toEqual({ ok: false, reason: 'not_operator' });
    expect(existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8'))) : []).toEqual([]);
  });

  it('refuses every tool before anyone signs in, and says how to sign in', async () => {
    const connector = await startConnector(sessionFile());
    const refused = await call(connector, 'list_properties');
    await connector.client.close();
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('pnpm connector:login');
  }, 60_000);
});

const demoProperty = (code: string) => ({
  nickname: `Demo Nhà phố ${code}`,
  code,
  kind: 'townhouse',
  kind_details: {},
  use_mode: 'rental',
  legal_status: 'certified',
  current_address: { house_no: '12 Demo', street: 'Đường số 5', commune_code: '27475', province_code: '79' },
  certificate_address_text: 'Thửa 12, tờ bản đồ 5, Phường Tân Kiểng, Quận 7',
  acquired_on: '2020-05-01',
  acquisition_kind: 'purchase',
  acquisition_price_vnd: 3_500_000_000,
  notes: 'Demo, mua qua môi giới',
});

const FORM_COLUMNS = 'nickname, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, acquired_on, acquisition_kind, acquisition_price_vnd, notes, created_by';

const plannedSchema = z.object({ planId: z.string(), items: z.array(z.object({ status: z.string(), id: z.string().nullable(), change: z.unknown().optional() })) });
const appliedSchema = z.object({ status: z.string(), items: z.array(z.object({ status: z.string(), refusal: z.unknown().optional() })) });

describe('plans and applies the changes Ryan approved', () => {
  const file = sessionFile();
  const otherFile = sessionFile();
  let connector: Connector;
  let other: Connector;
  let db: Db;

  beforeAll(async () => {
    expect(await signIn(OPERATOR, file)).toMatchObject({ ok: true });
    expect(await signIn('ryan.lane8@demo.esta.test', otherFile)).toMatchObject({ ok: true });
    db = clientAt(file);
    [connector, other] = await Promise.all([startConnector(file), startConnector(otherFile)]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([connector.client.close(), other.client.close()]);
  });

  const plan = async (items: unknown[]) => call(connector, 'plan_changes', { summary: 'Demo: thêm nhà phố', items });
  const laneContext = async () => ({ db, householdId: seedId('seed:household:lane-9'), clock: await readClock(db, { ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' }) });

  it('writes the same row the property form writes, once', async () => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.create', input: { property: demoProperty('CLAUDE1') } }])).json());
    expect(planned.items).toMatchObject([{ status: 'change' }]);
    const applied = await call(connector, 'apply_plan', { plan_id: planned.planId });
    expect(appliedSchema.parse(applied.json())).toMatchObject({ status: 'applied', items: [{ status: 'landed' }] });
    expect((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).toEqual({ kind: 'already_applied', status: 'applied' });

    const formId = randomUUID();
    expect(await runOp(propertyCreate, await laneContext(), { id: formId, property: demoProperty('FORM1') })).toMatchObject({ ok: true });
    const rows = await db.from('properties').select(FORM_COLUMNS).in('id', [planned.items[0]?.id ?? '', formId]);
    expect(rows.data).toHaveLength(2);
    const [viaClaude, viaForm] = rows.data ?? [];
    expect({ ...viaClaude, nickname: '' }).toEqual({ ...viaForm, nickname: '' });
  });

  it('plans an edit as only the fields that change, with their values before', async () => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.edit', input: { id: property(9, 'q7'), set: { notes: 'Demo: đã sơn lại' } } }])).json());
    expect(planned.items[0]).toMatchObject({ status: 'change', change: { id: property(9, 'q7'), before: { notes: null }, set: { notes: 'Demo: đã sơn lại' } } });
    expect(Object.keys(z.object({ change: z.object({ set: z.record(z.string(), z.unknown()) }) }).parse(planned.items[0]).change.set)).toEqual(['notes']);
  });

  it('stores nothing when an item is refused, and says why', async () => {
    const refused = await plan([
      { op: 'property.create', input: { property: demoProperty('CLAUDE2') } },
      { op: 'property.create', input: { property: { ...demoProperty('Q7'), nickname: 'Demo trùng mã' } } },
    ]);
    expect(refused.isError).toBe(true);
    expect(refused.json()).toMatchObject({ kind: 'items_refused', items: [{ status: 'change' }, { status: 'refused', refusal: { kind: 'code_taken', code: 'Q7', takenBy: 'Nhà phố Q7' } }] });
  });

  it('refuses a stale item and applies the rest, ending partial', async () => {
    const planned = plannedSchema.parse(
      (
        await plan([
          { op: 'property.edit', input: { id: property(9, 'thu-duc'), set: { notes: 'Demo: Claude' } } },
          { op: 'property.create', input: { property: demoProperty('CLAUDE3') } },
        ])
      ).json(),
    );
    expect(await runOp(propertyEdit, await laneContext(), { id: property(9, 'thu-duc'), set: { notes: 'Demo: Mẹ sửa trước' } })).toMatchObject({ ok: true });
    const applied = appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json());
    expect(applied).toMatchObject({ status: 'partial', items: [{ status: 'refused', refusal: { kind: 'stale' } }, { status: 'landed' }] });
  });

  it("refuses another household's plan as not found", async () => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.create', input: { property: demoProperty('CLAUDE4') } }])).json());
    expect((await call(other, 'apply_plan', { plan_id: planned.planId })).json()).toEqual({ kind: 'not_found' });
    expect(appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).status).toBe('applied');
  });

  it('refuses a plan older than 30 minutes as expired', async () => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.create', input: { property: demoProperty('CLAUDE6') } }])).json());
    setClock('2026-10-07T09:31:00+07:00');
    expect((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).toEqual({ kind: 'expired', expiredAt: '2026-10-07T02:30:00.000Z' });
  });

  it('records an item whose read failed as failed, lands the others, and finishes the batch', async () => {
    const planned = plannedSchema.parse(
      (
        await plan([
          { op: 'property.create', input: { property: demoProperty('CLAUDE7') } },
          { op: 'property.edit', input: { id: property(9, 'bao-loc'), set: { notes: 'Demo: Claude' } } },
          { op: 'property.create', input: { property: demoProperty('CLAUDE8') } },
        ])
      ).json(),
    );
    const applied = await applyPlan({ ...(await laneContext()), db: droppingQueriesOn(db, property(9, 'bao-loc')) }, planned.planId);
    expect(applied).toMatchObject({ ok: true, value: { status: 'partial', items: [{ status: 'landed' }, { status: 'refused', refusal: { kind: 'failed' } }, { status: 'landed' }] } });
    const batch = await db.from('change_batches').select('status, outcomes').eq('id', planned.planId).single();
    expect(batch.data).toMatchObject({ status: 'partial', outcomes: [{ status: 'landed' }, { status: 'refused' }, { status: 'landed' }] });
  });

  it('keeps an id whose last group is all digits whole, and cuts an ID number Ryan typed to its last four', async () => {
    const digitTail = `${randomUUID().slice(0, 24)}000000000123`;
    expect(await runOp(propertyCreate, await laneContext(), { id: digitTail, property: demoProperty('DIGITS') })).toMatchObject({ ok: true });
    const planned = plannedSchema.parse((await plan([{ op: 'property.edit', input: { id: digitTail, set: { notes: 'Demo: chủ cũ CCCD 001234567890' } } }])).json());
    expect(planned.items).toMatchObject([{ change: { id: digitTail, set: { notes: 'Demo: chủ cũ CCCD 7890' } } }]);
    const stored = await db.from('change_batches').select('plan').eq('id', planned.planId).single();
    expect(stored.data?.plan).toMatchObject({ items: [{ input: { id: digitTail }, change: { id: digitTail } }] });
    const applied = (await call(connector, 'apply_plan', { plan_id: planned.planId })).json();
    expect(applied).toMatchObject({ status: 'applied', items: [{ status: 'landed', output: { id: digitTail } }] });
    const row = await db.from('properties').select('id, notes').eq('id', digitTail).single();
    expect(row.data).toEqual({ id: digitTail, notes: 'Demo: chủ cũ CCCD 7890' });
  });

  it('cuts an ID number in the batch summary to its last four, in the stored row and its audit row', async () => {
    const summary = 'Demo: thêm nhà cho chủ cũ CCCD 001234567890';
    const planned = plannedSchema.parse((await call(connector, 'plan_changes', { summary, items: [{ op: 'property.create', input: { property: demoProperty('SUMID') } }] })).json());
    const stored = await db.from('change_batches').select('summary').eq('id', planned.planId).single();
    expect(stored.data?.summary).toBe('Demo: thêm nhà cho chủ cũ CCCD 7890');
    const audit = await db.from('audit_log').select('diff').eq('table_name', 'change_batches').eq('row_id', planned.planId);
    expect(audit.data?.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit.data)).not.toContain('001234567890');
    expect(JSON.stringify(audit.data)).toContain('7890');
  });

  it('finishes a batch a crash left half done once its claim is five minutes old, landing each item once', async () => {
    const planned = plannedSchema.parse(
      (
        await plan([
          { op: 'property.create', input: { property: demoProperty('CLAUDE5') } },
          { op: 'property.create', input: { property: demoProperty('CLAUDE9') } },
        ])
      ).json(),
    );
    const batch = await db.from('change_batches').select('plan, planned_at').eq('id', planned.planId).single();
    const plannedAt = z.string().parse(batch.data?.planned_at);
    const [first] = z.object({ items: z.array(z.object({ input: z.unknown() })) }).parse(batch.data?.plan).items;
    expect(await runOp(propertyCreate, await laneContext(), first?.input)).toMatchObject({ ok: true });
    const claimed = await db.from('change_batches').update({ status: 'applying', applied_at: plannedAt }).eq('id', planned.planId).select('id');
    expect(claimed.data).toHaveLength(1);

    const retryAt = new Date(Date.parse(plannedAt) + 5 * 60_000).toISOString();
    expect((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).toEqual({ kind: 'in_progress', retryAt });
    setClock(retryAt);
    const applied = appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json());
    expect(applied).toMatchObject({ status: 'applied', items: [{ status: 'landed' }, { status: 'landed' }] });
    const rows = await db.from('properties').select('id').in('code', ['CLAUDE5', 'CLAUDE9']);
    expect(rows.data?.map((row) => row.id).toSorted()).toEqual(planned.items.map((item) => item.id).toSorted());
    expect((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).toEqual({ kind: 'already_applied', status: 'applied' });
  });
});
