import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { planScheduledJobs } from '../packages/core/src/agent-schedule/index.ts';
import { isoDate } from '../packages/core/src/date/iso-date.ts';
import { formatBps, formatVnd } from '../packages/core/src/format/index.ts';
import { visibleText } from '../packages/core/src/guard/index.ts';
import { parseInstant } from '../packages/core/src/index.ts';
import { vnd } from '../packages/core/src/money/vnd.ts';
import { evaluateWatch } from '../packages/core/src/watch/index.ts';
import { existingLinks, readWatchSnapshot } from '../packages/ops/src/index.ts';
import { assertStartAllowed, parseAgentEnv } from '../apps/agent/src/env.ts';
import { JOBS, SCHEDULED_JOBS } from '../apps/agent/src/jobs/registry.ts';
import { serviceClient } from '../apps/agent/src/supabase.ts';
import { fact } from '../apps/agent/test/golden/ask-truth.ts';
import { compareFacts } from '../apps/agent/test/golden/watch-golden.ts';
import { DEMO_PASSWORD, householdId, householdSeeds } from '../supabase/seed/generator/households.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { checkClockSet } from './clock-set.ts';
import { parseSlot } from './slot.ts';
import { exitCodeFor, resolveMode, type ResultRow } from './live-run-policy.ts';
import { slotEnv } from './slot-env.ts';

/** AGENT.md §7.6: every job kind once on the `full` seed, with the clock frozen at the §7 day. */
const AS_OF = '2026-10-07T07:00:00+07:00';
const DAY = isoDate('2026-10-07');
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAILY = ['research_scan', 'portfolio_watch', 'morning_brief'] as const;
const WORD_LIMIT = 300;
const SUMMARY_WORD_LIMIT = 60;
const TERMINAL = new Set(['done', 'failed', 'dead']);

const { values } = parseArgs({ options: { mode: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' } } });
const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const mode = resolveMode(values.mode);
const live = mode === 'live';
const outDir = values.out ?? (live ? join(root, 'docs', 'plan', 'trail', 'phase-5') : join(tmpdir(), 'esta-live-run'));
const only = values.only?.split(',');
const wanted = (id: string) => only === undefined || only.includes(id);

const env = slotEnv(root, slot, { app: 'agent' });
if (process.env.ESTA_ENV === 'production' || env.ESTA_ENV === 'production') throw new Error('agent:live-run refuses ESTA_ENV=production');
const clockCheck = checkClockSet(AS_OF, env.SUPABASE_URL);
if ('exitCode' in clockCheck) throw new Error(clockCheck.message);
if (live) {
  const agentMode = assertStartAllowed(parseAgentEnv({ ...env, ESTA_AGENT_MODE: 'live' }));
  if (agentMode.agentMode !== 'live') throw new Error('agent:live-run --mode live needs a live agent mode');
  if (/fable/iu.test(agentMode.model)) throw new Error(`Refusing to run with ESTA_MODEL_ROUTINE=${agentMode.model}, a Fable model`);
  console.log(`auth=${agentMode.authMode} model=${agentMode.model}`);
}

const db = serviceClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', 'live-run');
const [demo] = householdSeeds(0);
if (demo === undefined) throw new Error('no demo household seed');
const HOUSEHOLD = householdId(demo);

const rows: ResultRow[] = [];
const record = (id: string, check: string, pass: boolean | null, detail = '') => {
  rows.push({ id, check, pass, detail });
  console.log(`${pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL'}  ${id.padEnd(16)} ${check}${detail === '' ? '' : ` (${detail})`}`);
};
const save = (name: string, data: unknown) => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
};

async function must<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error !== null || data === null) throw new Error(`${what}: ${error?.message ?? 'no data'}`);
  return data;
}

async function startWorker(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/agent-dev.ts'], {
    cwd: root,
    env: { ...process.env, ESTA_AGENT_MODE: mode, ESTA_AGENT_SCHEDULE: 'off' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => /worker \S+ started/.test(chunk.toString()) && resolve());
    child.once('exit', (code) => reject(new Error(`The worker exited with ${code}`)));
  });
  return child;
}

async function settled<T>(read: () => Promise<T | null>, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await read();
    if (found !== null) return found;
    if (Date.now() > deadline) throw new Error(`${what} did not finish within ${timeoutMs / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const jobTimeout = (kind: keyof typeof JOBS) => JOBS[kind].timeoutMs * (live ? 2 : 0.5);

async function runDailyJobs() {
  const planned = planScheduledJobs(SCHEDULED_JOBS, { householdIds: [HOUSEHOLD], now: parseInstant(AS_OF), timezone: TIMEZONE, existingKeys: new Set() }).filter((job) =>
    [...DAILY].some((kind) => kind === job.kind),
  );
  const rows = [
    ...planned.map((job) => ({ household_id: job.householdId, kind: job.kind, run_after: job.runAfter, idempotency_key: job.idempotencyKey, priority: 200 })),
  ];
  const { error } = await db.from('agent_jobs').insert(rows);
  if (error !== null) throw new Error(`Queueing the jobs failed (reset the seed with pnpm db:reset first): ${error.message}`);
  return settled(
    async () => {
      const jobs = await must(db.from('agent_jobs').select('id, kind, status, result, error').eq('household_id', HOUSEHOLD).in('kind', [...DAILY]), 'Reading the jobs');
      return jobs.length === rows.length && jobs.every((job) => TERMINAL.has(job.status)) ? jobs : null;
    },
    DAILY.reduce((total, kind) => total + jobTimeout(kind), 0),
    'The daily jobs',
  );
}

/** The weekly review is Sunday's job, so the clock moves to the Sunday its recording was made for (AGENT.md §3). */
async function freezeGlobalClock(frozenNow: string) {
  await db.from('test_clock').delete().is('for_household', null);
  const { error } = await db.from('test_clock').insert({ for_household: null, frozen_now: frozenNow });
  if (error !== null) throw new Error(`Freezing the clock failed: ${error.message}`);
}

async function runWeekly() {
  const sunday = '2026-10-11T08:00:00+07:00';
  await freezeGlobalClock(sunday);
  const key = `weekly_review:${HOUSEHOLD}:2026-W41`;
  const { error } = await db.from('agent_jobs').insert({ household_id: HOUSEHOLD, kind: 'weekly_review', run_after: sunday, idempotency_key: key, priority: 200 });
  if (error !== null) throw new Error(`Queueing the weekly review failed: ${error.message}`);
  const job = await settled(
    async () => {
      const [found] = await must(db.from('agent_jobs').select('status, error').eq('idempotency_key', key), 'Reading the weekly review');
      return found !== undefined && TERMINAL.has(found.status) ? found : null;
    },
    jobTimeout('weekly_review'),
    'The weekly review',
  );
  record('weekly_review', 'job done', job.status === 'done', job.status === 'done' ? '' : `${job.status}: ${job.error ?? ''}`);
  const notes = await todaysItems(['weekly']);
  record('weekly_review', 'saved one weekly note', notes.length === 1, `${notes.length} notes`);
  save('weekly_review', notes);
}

async function todaysItems(kinds: readonly string[]) {
  const items = await must(db.from('agent_items').select('kind, title, body_md, dedupe_key, created_at').eq('household_id', HOUSEHOLD).in('kind', [...kinds]).order('created_at'), 'Reading the notes');
  return items.filter((item) => !item.dedupe_key.startsWith('seed:'));
}

const words = (text: string) => text.split(/\s+/u).filter(Boolean).length;

async function checkWatch() {
  const snapshot = await readWatchSnapshot(db, HOUSEHOLD, { asOf: DAY, timezone: TIMEZONE });
  const found = compareFacts(evaluateWatch(snapshot), 'demo');
  record('watch', '§7.1 facts equal the golden set', found.missing.length === 0 && found.extra.length === 0, `${found.matched} matched, missing [${found.missing}], extra [${found.extra}]`);
}

async function checkJobs(jobs: Array<{ id: string; kind: string; status: string; error: string | null }>) {
  for (const job of jobs) record(job.kind, 'job done', job.status === 'done', job.status === 'done' ? '' : `${job.status}: ${job.error ?? ''}`);
  const notes = await todaysItems(['alert']);
  record('portfolio_watch', 'left a note, every action fact told', notes.length > 0, `${notes.length} notes`);
  save('portfolio_watch', notes);
}

async function checkBrief() {
  const [brief] = await todaysItems(['brief']);
  if (brief === undefined) return record('morning_brief', '§7.3 brief saved', false, 'no brief');
  const body = brief.body_md ?? '';
  const text = `${brief.title} ${visibleText(body)}`;
  const links = [...body.matchAll(/\]\((esta:\/\/[^)]+)\)/g)].map(([, link]) => link ?? '');
  const present = await existingLinks(db, HOUSEHOLD, links);
  const sections = [...body.matchAll(/\*\*([^*]+)\*\*/g)].map(([, name]) => name);
  record('morning_brief', '§7.3 at most 300 words', words(text) <= WORD_LIMIT, `${words(text)} words`);
  record('morning_brief', '§7.3 every link resolves', links.length > 0 && links.every((link) => present.has(link)), `${links.length} links`);
  record('morning_brief', '§7.3 sections in order', JSON.stringify(sections.slice(0, 3)) === JSON.stringify(['Cần làm', 'Theo dõi', 'Thị trường']), sections.join(' > '));
  record('morning_brief', '§7.3 no placeholder left', !/\{\{|\}\}/.test(body + brief.title));
  save('morning_brief', brief);
}

async function checkResearch() {
  const items = await must(
    db.from('research_items').select('url_normalized, source_url, title_vi, summary_vi, related_property_ids, created_at').eq('household_id', HOUSEHOLD).gte('created_at', '2026-10-06T17:00:00Z'),
    'Reading the research items',
  );
  const [empty] = await todaysItems(['research_scan_empty']);
  record('research_scan', '§7.5 an item or the explicit empty item', items.length > 0 || empty !== undefined, `${items.length} items`);
  record('research_scan', '§7.5 summaries within the limit, in Vietnamese', items.every((item) => words(item.summary_vi) <= SUMMARY_WORD_LIMIT && /[À-ỹ]/u.test(item.summary_vi)));
  record('research_scan', '§7.5 no duplicate link', new Set(items.map((item) => item.url_normalized)).size === items.length);
  const properties = new Set((await must(db.from('properties').select('id').eq('household_id', HOUSEHOLD), 'Reading the properties')).map((property) => property.id));
  record('research_scan', '§7.5 related properties exist', items.every((item) => item.related_property_ids.every((id) => properties.has(id))));
  if (!live) return record('research_scan', '§7.5 every source URL returns 200', null, 'replay recordings cite example.vn pages; checked in the live run');
  const statuses = await Promise.all(items.map(async (item) => ({ url: item.source_url, status: await fetch(item.source_url, { redirect: 'follow' }).then((response) => response.status, () => 0) })));
  record('research_scan', '§7.5 every source URL returns 200', statuses.every(({ status }) => status === 200), statuses.map(({ url, status }) => `${status} ${url}`).join('; '));
  save('research_scan', items);
}

const money = (question: string, figure: string) => () => formatVnd(vnd(Number(fact(question, figure))), 'vi');
const plain = (question: string, figure: string) => () => fact(question, figure);
const yieldOf = () => formatBps(Number(fact('q9', 'q1 gross yield bp')), 'vi');

type AskCheck = {
  readonly id: string;
  readonly question: string;
  readonly figures?: ReadonlyArray<() => string | readonly string[]>;
  readonly sourceChip?: true;
  readonly topic?: { readonly kind: 'item' | 'property'; readonly id: string };
  readonly noNumber?: true;
  readonly english?: true;
};

const ROOM_2_RENT = 2_500_000;

/** The annuity formula on 2 tỷ over 180 months at 9% a year, which AGENT.md §7.4 T6 holds the answer to within 1 đồng. */
function loanPayment(): string[] {
  const monthly = 0.09 / 12;
  const payment = Math.round((2_000_000_000 * monthly) / (1 - (1 + monthly) ** -180));
  return [payment - 1, payment, payment + 1].map((amount) => formatVnd(vnd(amount), 'vi'));
}

const BAO_LOC = seedId('seed:property:demo:bao-loc');
const OVERDUE_NOTE = seedId('seed:agent-item:W1-demo');

/** AGENT.md §7.4: the ten golden questions, then the thread cases T1 to T8. */
const ASKS: readonly AskCheck[] = [
  { id: 'q1', question: 'Tháng này thu được bao nhiêu từ Dĩ An?', figures: [money('q1', 'di-an income received in October 2026')] },
  { id: 'q2', question: 'Phòng nào ở Dĩ An đang quá hạn đóng tiền?', figures: [plain('q2', 'di-an units overdue'), money('q2', 'di-an amount overdue')] },
  { id: 'q3', question: 'Hợp đồng nào hết hạn trong 60 ngày tới?', figures: [plain('q3', 'leases ending within 60 days')] },
  { id: 'q4', question: 'Tổng tiền cọc đang giữ là bao nhiêu?', figures: [money('q4', 'deposits held')] },
  { id: 'q5', question: 'Doanh thu cho thuê năm nay của mẹ là bao nhiêu, còn cách ngưỡng 500 triệu bao xa?', figures: [money('q5', 'Nguyễn Thị Demo accrued 2026'), money('q5', 'Nguyễn Thị Demo projected 2026')] },
  { id: 'q6', question: 'Kho Biên Hòa để trống bao lâu rồi?', figures: [plain('q6', 'bien-hoa days empty')] },
  { id: 'q7', question: 'Chi phí sửa chữa năm nay của Nhà phố Q7 là bao nhiêu?', figures: [money('q7', 'q7 repairs paid in 2026')] },
  { id: 'q8', question: 'Sổ đất Bảo Lộc có đang thế chấp không, ở ngân hàng nào?', figures: [plain('q8', 'bao-loc mortgage bank'), money('q8', 'bao-loc mortgage amount')] },
  { id: 'q9', question: 'Lợi suất cho thuê gộp của Mặt bằng Quận 1 là bao nhiêu?', figures: [yieldOf] },
  { id: 'q10', question: 'Which tenant paid late most often this year?', figures: [plain('q10', 'tenant who paid late most often')], english: true },
  { id: 't1', question: 'Viết tin nhắn Zalo nhắc khách phòng 5 ở Dĩ An đóng tiền.', figures: [plain('t1', 'di-an overdue tenant'), money('q2', 'di-an amount overdue')] },
  { id: 't2', question: 'Có nên cho thuê theo năm thay vì theo tháng không?', noNumber: true },
  { id: 't3', question: 'Khách này trễ mấy lần rồi?', topic: { kind: 'item', id: OVERDUE_NOTE }, figures: [plain('t1', 'di-an overdue tenant')] },
  { id: 't4', question: 'Tài sản này đang thế chấp ở đâu?', topic: { kind: 'property', id: BAO_LOC }, figures: [plain('q8', 'bao-loc mortgage bank')] },
  { id: 't5', question: 'Nếu tăng tiền phòng 2 ở Dĩ An lên 4tr thì mỗi năm thu thêm bao nhiêu?', figures: [() => formatVnd(vnd((4_000_000 - ROOM_2_RENT) * 12), 'vi')] },
  { id: 't6', question: 'Vay 2 tỷ trong 15 năm, lãi 9%/năm thì mỗi tháng trả bao nhiêu?', figures: [loanPayment] },
  { id: 't7', question: 'Lãi suất vay mua nhà bây giờ khoảng bao nhiêu?', sourceChip: true },
  { id: 't8', question: 'Giá đất Bảo Lộc bây giờ khoảng bao nhiêu?', noNumber: true },
];

async function sourceChips(refs: unknown): Promise<Array<{ url: string; status: number }>> {
  const urls = [...new Set(JSON.stringify(refs).match(/https?:\/\/[^"\\\s]+/g) ?? [])];
  return Promise.all(urls.map(async (url) => ({ url, status: await fetch(url, { redirect: 'follow' }).then((response) => response.status, () => 0) })));
}

const squash = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

async function runAsks() {
  const member = createClient(env.SUPABASE_URL ?? '', env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false } });
  const signedIn = await member.auth.signInWithPassword({ email: 'me@demo.esta.test', password: DEMO_PASSWORD });
  if (signedIn.error !== null) throw new Error(`Signing in as the seeded member failed: ${signedIn.error.message}`);
  const answers: Record<string, unknown> = {};
  for (const ask of ASKS.filter((candidate) => wanted(candidate.id))) {
    await must(db.from('conversations').delete().eq('household_id', HOUSEHOLD).select('id'), 'Clearing the thread');
    const questionId = randomUUID();
    const started = Date.now();
    const sent = await member.rpc('ask_in_thread', {
      p_household_id: HOUSEHOLD,
      p_question_id: questionId,
      p_question: ask.question,
      p_deep: false,
      ...(ask.topic === undefined ? {} : { p_topic: ask.topic.kind === 'item' ? { kind: 'item', id: ask.topic.id } : { kind: 'property', id: ask.topic.id } }),
    });
    if (sent.error !== null) {
      record(ask.id, '§7.4 asked', false, sent.error.message);
      continue;
    }
    const first: { seconds: number | null } = { seconds: null };
    const answer = await settled(
      async () => {
        const reply = await must(db.from('messages').select('content_md, status, refs').eq('household_id', HOUSEHOLD).eq('conversation_id', sent.data).eq('role', 'assistant'), 'Reading the answer');
        if (first.seconds === null && (reply[0]?.content_md ?? '') !== '') first.seconds = (Date.now() - started) / 1000;
        return reply[0] !== undefined && reply[0].status !== 'streaming' ? reply[0] : null;
      },
      jobTimeout('ask') * 2,
      `The answer to ${ask.id}`,
    );
    const text = squash(answer.content_md ?? '');
    const links = [...text.matchAll(/\]\((esta:\/\/[^)]+)\)/g)].map(([, link]) => link ?? '');
    const present = await existingLinks(db, HOUSEHOLD, links);
    const missing = (ask.figures ?? []).map((figure) => [figure()].flat().map(squash)).filter((options) => !options.some((option) => text.includes(option))).map((options) => options.join(' or '));
    const chips = ask.sourceChip === true ? await sourceChips(answer.refs) : null;
    const problems = [
      ...(answer.status === 'done' ? [] : [`status ${answer.status}`]),
      ...(missing.length === 0 ? [] : [`missing ${missing.join(' | ')}`]),
      ...(links.every((link) => present.has(link)) ? [] : ['a link does not resolve']),
      ...(/\{\{|\}\}/.test(text) ? ['placeholder left'] : []),
      ...(chips === null || (chips.length > 0 && chips.every(({ status }) => status === 200)) ? [] : [`source chips ${chips.map(({ url, status }) => `${status} ${url}`).join('; ') || 'none'}`]),
      ...(ask.noNumber === true && /\p{N}|₫|%/u.test(text) ? ['a number in an answer that has none'] : []),
      ...(ask.english === true && !/\b(paid|late|the)\b/i.test(text) ? ['not in English'] : []),
    ];
    const seconds = `${((Date.now() - started) / 1000).toFixed(1)} s, first text at ${first.seconds?.toFixed(1)} s`;
    record(ask.id, '§7.4 answer states the ground truth', problems.length === 0, problems.join('; ') || seconds);
    answers[ask.id] = { question: ask.question, answer: text, refs: answer.refs, seconds, firstContentS: first.seconds };
  }
  if (Object.keys(answers).length > 0) save('ask', answers);
}

async function recordUsage() {
  const runs = await must(
    db.from('agent_runs').select('job_id, auth_mode, agent_mode, model, num_turns, cost_estimate_usd, started_at, finished_at').eq('household_id', HOUSEHOLD),
    'Reading the runs',
  );
  const jobs = await must(db.from('agent_jobs').select('id, kind').eq('household_id', HOUSEHOLD), 'Reading the job kinds');
  const kindOf = new Map(jobs.map((job) => [job.id, job.kind]));
  const usage = runs.filter((run) => kindOf.get(run.job_id) !== 'ping').map((run) => ({ ...run, kind: kindOf.get(run.job_id), wall_s: (Date.parse(run.finished_at ?? run.started_at) - Date.parse(run.started_at)) / 1000 }));
  save('runs', usage);
  const cost = usage.reduce((total, run) => total + Number(run.cost_estimate_usd ?? 0), 0);
  record('usage', `every run is ${mode}`, usage.length > 0 && usage.every((run) => run.agent_mode === mode), `${usage.length} runs, total_cost_usd ${cost.toFixed(4)}`);
  const slow = usage.filter((run) => run.kind !== undefined && run.kind in JOBS && run.wall_s * 1000 > JOBS[run.kind as keyof typeof JOBS].timeoutMs);
  record('usage', 'no job past its AGENT.md §3 timeout', slow.length === 0, slow.map((run) => run.kind).join(', '));
  if (live) record('usage', 'subscription auth mode', usage.every((run) => run.auth_mode === 'subscription'), [...new Set(usage.map((run) => run.auth_mode))].join(', '));
}

const NOT_LIVE = 'live only; replay is covered by `ESTA_AGENT_MODE=replay pnpm --filter agent test`';

function runScript(script: string, args: readonly string[]): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.once('close', (code) => resolve({ code, stdout }));
  });
}

/** AGENT.md §7.2 targets: every extraction schema-valid, required fields exact at 90%, high-confidence fields correct at 97%. */
async function checkExtraction() {
  if (!live) return record('extraction', '§7.2 meets its targets', null, NOT_LIVE);
  const { code, stdout } = await runScript('scripts/extraction-eval.ts', ['--mode', 'live', '--set', 'synthetic']);
  save('extraction', { code, report: stdout });
  const [, valid, required, confident] = /schema-valid ([\d.]+)%, required exact ([\d.]+)%, high-confidence precision ([\d.]+)%/.exec(stdout) ?? [];
  const met = code === 0 && Number(valid) === 100 && Number(required) >= 90 && Number(confident) >= 97;
  record('extraction', '§7.2 meets its targets', met, `schema-valid ${valid}%, required exact ${required}%, high-confidence ${confident}%`);
}

async function checkGuardProbe() {
  if (!live) return record('guard-probe', 'no row in error, no repair rejected', null, NOT_LIVE);
  const out = join(outDir, 'guard-probe.json');
  const { code } = await runScript('scripts/guard-probe.ts', ['--out', out]);
  const { summary } = JSON.parse(readFileSync(out, 'utf8')) as { summary: { prompts: number; firstPassRejected: number; repairRejected: number; error: number } };
  record('guard-probe', 'no row in error, no repair rejected', code === 0 && summary.error === 0 && summary.repairRejected === 0, `${summary.prompts} prompts, ${summary.firstPassRejected} first pass rejected, ${summary.repairRejected} repair rejected, ${summary.error} in error`);
}

function table(): string {
  const mark = (pass: boolean | null) => (pass === null ? 'not run' : pass ? 'pass' : 'FAIL');
  return ['| Kind | Check | Result | Detail |', '| --- | --- | --- | --- |', ...rows.map((row) => `| ${row.id} | ${row.check} | ${mark(row.pass)} | ${row.detail.replaceAll('|', '/')} |`)].join('\n');
}

async function main() {
  await freezeGlobalClock(AS_OF);
  const worker = await startWorker();
  try {
    if (wanted('daily')) {
      await checkJobs(await runDailyJobs());
      await checkWatch();
      await checkBrief();
      await checkResearch();
    }
    await runAsks();
    if (wanted('weekly_review')) await runWeekly();
    await recordUsage();
    if (wanted('extraction')) await checkExtraction();
    if (wanted('guard-probe')) await checkGuardProbe();
  } finally {
    worker.kill('SIGTERM');
    await db.from('test_clock').delete().is('for_household', null);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, only === undefined ? 'table.md' : 'table-rerun.md'), `${table()}\n`);
  console.log(`\n${table()}\n\nOutputs in ${outDir} (${mode})`);
  process.exitCode = exitCodeFor(rows, mode);
}

await main();
