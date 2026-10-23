import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export type Requirement =
  | { kind: 'acceptance'; id: string }
  | { kind: 'north-star'; step: number }
  | { kind: 'phase-exit'; phase: number }
  | { kind: 'mom-test'; phase: number };

export type Spec = {
  prefixes: string[];
  acceptance: string[];
  northStarSteps: number[];
  phases: number[];
  phaseExitSteps: Map<number, number[]>;
  momTestPhases: number[];
};

export type InventoryRow = { phase: number; pr: string; text: string };

export type CoverageReport = { lines: string[]; problems: string[] };

const label = (r: Requirement): string => {
  switch (r.kind) {
    case 'acceptance':
      return r.id;
    case 'north-star':
      return `north-star step ${r.step}`;
    case 'phase-exit':
      return `Phase ${r.phase} exit`;
    case 'mom-test':
      return `Mom test in Phase ${r.phase}`;
  }
};

function section(text: string, startPattern: RegExp, endPattern: RegExp): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && endPattern.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

export function parseSpec(text: string): Spec {
  const features = section(text, /^## 6\. /, /^## /);
  const prefixes = features.flatMap((line) => line.match(/^### 6\.\d+ .*\(([A-Z]{3})\)$/)?.slice(1) ?? []);
  const acceptance = features.flatMap((line) => line.match(/^- ([A-Z]{3}-\d+) /)?.slice(1) ?? []);
  const northStarSteps = section(text, /^### 1\.2 North-star/, /^#{2,3} /).flatMap((line) => {
    const step = line.match(/^(\d+)\. /)?.[1];
    return step === undefined ? [] : [Number(step)];
  });
  const phases: number[] = [];
  const phaseExitSteps = new Map<number, number[]>();
  for (const line of section(text, /^## 10\. Delivery phases/, /^#{2,3} /)) {
    const phase = line.match(/^\| (\d+) [A-Z]/)?.[1];
    if (phase === undefined) continue;
    phases.push(Number(phase));
    const exitPredicate = line.split('|')[3] ?? '';
    const steps = /\bfull north-star\b/i.test(exitPredicate) ? northStarSteps : citedNorthStarSteps(exitPredicate);
    if (steps.length > 0) phaseExitSteps.set(Number(phase), steps);
  }
  const mom = text.match(/^### [\d.]+ Mom test \(.*after Phase (\d+), repeated in Phase (\d+)\)/m);
  const momTestPhases = mom ? [Number(mom[1]), Number(mom[2])] : [];
  return { prefixes, acceptance, northStarSteps, phases, phaseExitSteps, momTestPhases };
}

export function parseInventory(text: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  let phase: number | undefined;
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (?:Phase (\d+)\. )?/);
    if (heading) phase = heading[1] === undefined ? undefined : Number(heading[1]);
    if (phase === undefined || !line.startsWith('|')) continue;
    const pr = line
      .split('|')
      .map((cell) => cell.trim())
      .find((cell) => /^P\d-\d{2}[a-z]?$/.test(cell));
    if (pr) rows.push({ phase, pr, text: line });
  }
  return rows;
}

function citedAcceptanceIds(text: string, prefixes: string[]): string[] {
  const known = prefixes.join('|');
  const ids = [...text.matchAll(new RegExp(`\\b(?:${known})-\\d+\\b`, 'g'))].map((m) => m[0]);
  for (const [, prefix, from, to] of text.matchAll(new RegExp(`\\b(${known})-(\\d+) to \\1-(\\d+)\\b`, 'g'))) {
    for (let n = Number(from); n <= Number(to); n++) ids.push(`${prefix}-${n}`);
  }
  return ids;
}

function citedNorthStarSteps(text: string): number[] {
  const steps: number[] = [];
  for (const [, from, joiner, to] of text.matchAll(/north-star steps? (\d+)(?: (and|to) (\d+))?/gi)) {
    const first = Number(from);
    const last = Number(to);
    if (joiner === 'to') for (let n = first; n <= last; n++) steps.push(n);
    else steps.push(...(joiner === 'and' ? [first, last] : [first]));
  }
  return steps;
}

function citedPhaseExits(text: string): number[] {
  return [...text.matchAll(/\bPhase (\d+) exit\b/g)].map((m) => Number(m[1]));
}

export function coverage(spec: Spec, rows: InventoryRow[]): CoverageReport {
  const problems: string[] = [];
  if (spec.prefixes.length === 0 || spec.acceptance.length === 0) {
    problems.push('SPEC §6 defines no acceptance ids; the SPEC parser found nothing');
  }
  if (spec.northStarSteps.length === 0) problems.push('SPEC §1.2 lists no north-star steps');
  if (spec.phases.length === 0) problems.push('SPEC §10 lists no phases');
  if (spec.momTestPhases.length === 0) problems.push('SPEC has no Mom test heading naming its phases');
  if (rows.length === 0) problems.push('The inventory has no PR rows under a "## Phase N." heading');

  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.pr, (seen.get(row.pr) ?? 0) + 1);
  for (const [pr, count] of seen) if (count > 1) problems.push(`${pr} appears in ${count} rows`);

  const defined = new Set(spec.acceptance);
  const steps = new Set(spec.northStarSteps);
  const phases = new Set(spec.phases);
  const covering = new Map<string, string[]>();
  const cover = (r: Requirement, pr: string) => {
    const key = label(r);
    const prs = covering.get(key) ?? [];
    if (!prs.includes(pr)) prs.push(pr);
    covering.set(key, prs);
  };

  for (const row of rows) {
    for (const id of citedAcceptanceIds(row.text, spec.prefixes)) {
      if (defined.has(id)) cover({ kind: 'acceptance', id }, row.pr);
      else problems.push(`${row.pr} cites ${id}, which SPEC §6 does not define`);
    }
    for (const step of citedNorthStarSteps(row.text)) {
      if (steps.has(step)) cover({ kind: 'north-star', step }, row.pr);
      else problems.push(`${row.pr} cites north-star step ${step}, which SPEC §1.2 does not define`);
    }
    for (const phase of citedPhaseExits(row.text)) {
      if (!phases.has(phase)) problems.push(`${row.pr} cites the Phase ${phase} exit, which SPEC §10 does not define`);
      else if (phase !== row.phase) problems.push(`${row.pr} sits in Phase ${row.phase} but cites the Phase ${phase} exit`);
      else {
        cover({ kind: 'phase-exit', phase }, row.pr);
        const cited = citedNorthStarSteps(row.text);
        for (const step of spec.phaseExitSteps.get(phase) ?? []) {
          if (!cited.includes(step)) {
            problems.push(`${row.pr} carries the Phase ${phase} exit but cites no north-star step ${step}, which SPEC §10 puts in that exit`);
          }
        }
        if (spec.momTestPhases.includes(phase) && /\bMom test\b/.test(row.text)) cover({ kind: 'mom-test', phase }, row.pr);
      }
    }
  }

  const requirements: Requirement[] = [
    ...spec.acceptance.map((id): Requirement => ({ kind: 'acceptance', id })),
    ...spec.northStarSteps.map((step): Requirement => ({ kind: 'north-star', step })),
    ...spec.phases.map((phase): Requirement => ({ kind: 'phase-exit', phase })),
    ...spec.momTestPhases.map((phase): Requirement => ({ kind: 'mom-test', phase })),
  ];
  const lines = requirements.map((r) => `${label(r)} -> ${(covering.get(label(r)) ?? []).join(', ') || 'NONE'}`);
  for (const r of requirements) {
    const prs = covering.get(label(r)) ?? [];
    if (prs.length === 0) {
      problems.push(
        r.kind === 'mom-test'
          ? `The Phase ${r.phase} exit PR does not carry the Mom test`
          : `${label(r)} is in SPEC but no PR in the inventory covers it`,
      );
    }
    if (r.kind === 'phase-exit' && prs.length > 1) problems.push(`Phase ${r.phase} exit is on ${prs.length} PRs: ${prs.join(', ')}`);
  }
  return { lines, problems };
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const { values } = parseArgs({
    options: {
      spec: { type: 'string', default: join(root, 'docs/spec/SPEC.md') },
      inventory: { type: 'string', default: join(root, 'docs/plan/trail/pr-inventory.md') },
      quiet: { type: 'boolean', default: false },
    },
  });
  const spec = parseSpec(readFileSync(values.spec, 'utf8'));
  const rows = parseInventory(readFileSync(values.inventory, 'utf8'));
  const report = coverage(spec, rows);
  if (!values.quiet) console.log(report.lines.join('\n'));
  if (report.problems.length > 0) {
    console.error(`plan coverage failed for ${values.inventory}:\n${report.problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(
    `plan coverage: ${spec.acceptance.length} acceptance ids, ${spec.northStarSteps.length} north-star steps, ` +
      `${spec.phases.length} phase exits and the Mom test in phases ${spec.momTestPhases.join(' and ')} map to ${rows.length} PRs`,
  );
}
